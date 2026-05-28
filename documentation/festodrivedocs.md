# FestoDrive Method Documentation (Detailed)

## Overview

`FestoDrive` is the **high-level application-facing drive API** for the ESP32 firmware.

It sits above:

* `CiA402Drive` (generic drive profile logic)
* `CANOpenSDO` (object dictionary access)
* `CANOpenNMT` (network management)

Its job is to provide **friendly, intention-based methods** such as:

* `home()`
* `startVelocity(velocity)`
* `moveAbsolute(position)`
* `stop()`
* `readFaultHistory()`

instead of forcing the rest of the firmware (or the frontend) to deal directly with:

* controlword bitfields
* mode switching
* raw object dictionary access
* state machine sequencing

---

# Class Role in the Architecture

```text
Frontend / CommandManager
        ↓
    FestoDrive
        ↓
 ┌───────────────┬───────────────┬───────────────┐
 │   CiA402Drive │   CANOpenSDO  │   CANOpenNMT  │
 └───────────────┴───────────────┴───────────────┘
```

`FestoDrive` should be the **single place** where application-level drive operations are defined.

---

# Dependencies

A typical constructor shape is:

```cpp
FestoDrive(uint8_t nodeId,
           CiA402Drive& cia402,
           CANOpenSDO& sdo,
           CANOpenNMT& nmt,
           DriveStatus* state);
```

## Dependencies explained

### `nodeId`

The CANopen node ID of the drive.

Used for:

* SDO requests (`0x600 + nodeId` / `0x580 + nodeId`)
* NMT commands that target a specific node
* any node-specific diagnostic reads

### `CiA402Drive& cia402`

Provides generic CiA 402 functionality:

* controlword / statusword handling
* mode switching
* state machine transitions
* generic status updates

### `CANOpenSDO& sdo`

Used when `FestoDrive` needs direct object access:

* homing parameters
* position / velocity profile parameters
* error history
* vendor-specific Festo objects (if added later)

### `CANOpenNMT& nmt`

Used for:

* starting the node
* entering pre-op if required
* resetting node / communication (if implemented)

### `DriveStatus* state`

Shared cached state structure.

Typically stores:

* `statusword`
* `activeMode`
* `positionActual`
* `velocityActual`
* `fault`
* `enabled`
* `homed`
* `moving`

---

# Design Principles

## 1. Public methods should be high-level

Good public API:

* `home()`
* `startVelocity(1500)`
* `moveAbsolute(10000)`

Avoid exposing too much raw internal detail to the command layer.

## 2. Public methods should enforce safety / sequencing

For example, `moveAbsolute()` should ideally:

* ensure drive is homed
* ensure drive is enabled
* ensure correct mode is active
* then perform the move

## 3. Low-level setters can remain private if not needed externally

Examples:

* `setTargetPosition()`
* `triggerNewSetpoint()`
* `setHomingMethod()`

---

# Method Groups

`FestoDrive` is best understood in five groups:

1. **Control**
2. **Homing**
3. **Velocity**
4. **Position**
5. **Error Handling**

---

# 1. Control Methods

These methods manage:

* connectivity
* CiA 402 enable/disable transitions
* emergency/stop behaviour
* cached status updates

---

## `bool connect()`

### Purpose

Checks that the drive is reachable and CANopen communication is available.

### Typical behaviour

A practical implementation may:

1. Send NMT Start Node
2. Attempt an SDO read of a known object (e.g. `0x6041:00` or `0x1000:00`)
3. Return success if the drive responds

### Why it exists

Provides a simple “is the drive there?” check for the frontend.

### Likely objects / traffic used

* NMT command on `0x000`
* SDO read of:

  * `0x6041:00` Statusword, or
  * `0x1000:00` Device type

### Return value

* `true` = drive responded
* `false` = no response / communication failed

### Recommended frontend command

```json
{"cmd":"connect"}
```

### Notes

This does **not** necessarily mean the motor is enabled. It only confirms communication.

---

## `bool initialise()`

### Purpose

Bring the drive into a known safe and usable state.

### Typical responsibilities

* call `connect()`
* perform `updateStatus()`
* if faulted, optionally attempt `faultReset()`
* apply any default profile configuration
* leave drive disabled or ready, depending on desired behaviour

### Why it exists

Useful as a single frontend command for initial setup after boot.

### Return value

* `true` = initialisation completed successfully
* `false` = failed during one of the setup steps

### Notes

This is optional but very useful in practice.

---

## `bool faultReset()`

### Purpose

Clear a CiA 402 fault state.

### Typical behaviour

* write controlword `0x0080` to `0x6040:00`
* optionally clear bit again depending on implementation
* poll statusword until fault bit clears or timeout

### Objects touched

* `0x6040:00` Controlword
* `0x6041:00` Statusword

### Preconditions

* drive is currently faulted

### Return value

* `true` = fault cleared
* `false` = fault remains / communication failure

### Notes

This should **not** recursively call itself. It should call the lower-level `CiA402Drive` implementation or perform the controlword write directly.

---

## `bool enable()`

### Purpose

Transition the drive into **Operation Enabled**.

### Typical CiA 402 sequence

```text
0x6040 = 0x0006   (Shutdown)
0x6040 = 0x0007   (Switch On)
0x6040 = 0x000F   (Enable Operation)
```

### Objects touched

* `0x6040:00` Controlword
* `0x6041:00` Statusword

### Preconditions

* CANopen communication working
* no active fault (or fault already reset)

### Side effects

* drive power stage becomes active
* motor can now accept motion commands

### Return value

* `true` = drive reached Operation Enabled
* `false` = sequence failed / timed out

### Notes

This is the standard “servo on” function.

---

## `bool disable()`

### Purpose

Disable motor operation while keeping communication alive.

### Typical behaviour

Usually writes one of:

* `0x0007` → disable operation but remain switched on
* `0x0000` → disable voltage (more aggressive)

### Objects touched

* `0x6040:00` Controlword

### Side effects

* drive no longer executes motion commands
* depending on chosen controlword, motor stage may remain partially active or be fully disabled

### Return value

* `true` = command accepted
* `false` = communication failure / invalid transition

### Notes

For v1, `0x0007` is often a sensible “disable operation” choice.

---

## `bool quickStop()`

### Purpose

Request a **CiA 402 Quick Stop**.

### Typical behaviour

* write controlword `0x0002`
* drive decelerates according to quick-stop deceleration configuration

### Objects touched

* `0x6040:00` Controlword
* optionally `0x6085:00` Quick Stop Deceleration (configured elsewhere)

### When to use

* emergency-ish but controlled stop
* faster than a normal profile decel stop
* safer than abruptly disabling voltage

### Return value

* `true` = request sent successfully
* `false` = communication failure

### Notes

This is **not** the same as a normal stop. It is a special CiA 402 stop path.

---

## `bool stop()`

### Purpose

Perform a **normal controlled stop** appropriate to the currently active mode.

### Typical intended behaviour

#### If in Profile Velocity mode

* write target velocity = `0`

#### If in Profile Position mode

* use halt behaviour / stop profile motion in a controlled way
* implementation depends on Festo support and desired behaviour

### Why this exists

Gives the frontend a generic “stop motion now, but not emergency stop” command.

### Objects touched

Depends on mode:

* Velocity mode: `0x60FF:00`
* Position mode: controlword mode-specific halt bit or Festo-specific logic

### Return value

* `true` = stop request accepted
* `false` = failed / unsupported in current mode

### Notes

This should **not** normally disable the drive. It should stop motion while keeping the drive ready.

---

## `bool updateStatus()`

### Purpose

Refresh the cached `DriveStatus` structure from the drive.

### Typical fields updated

* `statusword`
* `activeMode`
* `positionActual`
* `velocityActual`
* `fault`
* `enabled`
* `homed`
* `moving`

### Likely objects touched

* `0x6041:00` Statusword
* `0x6061:00` Mode display
* `0x6064:00` Position actual value
* `0x606C:00` Velocity actual value

### Why it exists

Allows the frontend to receive periodic status updates without manually polling many objects.

### Return value

* `true` = all or most critical fields updated successfully
* `false` = failed to refresh key fields

### Notes

This is one of the most important methods in the class.

---

## `bool getStatus(DriveStatus& out)`

### Purpose

Copy the cached internal status into an output struct.

### Behaviour

* reads no CAN directly (ideally)
* just returns the last cached values

### Why it exists

Keeps serial responses fast and predictable.

### Return value

* `true` = status copied
* `false` = optional if state pointer invalid

### Notes

Usually used after `updateStatus()`.

---

## `bool isFaulted() const`

### Purpose

Returns whether the drive is currently faulted.

### Source of truth

Usually derived from cached statusword fault bit.

### Notes

Should not trigger CAN traffic; should use cached state.

---

## `bool isEnabled() const`

### Purpose

Returns whether the drive is in **Operation Enabled**.

### Source of truth

Usually derived from cached statusword / decoded CiA 402 state.

---

## `bool isHomed() const`

### Purpose

Returns whether the drive has completed homing successfully.

### Source of truth

Could be based on:

* cached homing flag set after successful `home()`
* statusword homing-attained bit (mode-dependent)
* vendor-specific confirmation if available

### Notes

For your project, this is important because both profile position and profile velocity are assumed to require homing first.

---

## `bool isMoving() const`

### Purpose

Returns whether the drive is currently moving.

### Possible implementations

* actual velocity != 0
* target not reached bit is false
* internal motion command in progress flag

### Notes

Exact behaviour depends on how you want the frontend to interpret “moving”.

---

# 2. Homing Methods

These methods configure and execute the homing procedure.

For your project, **homing is a prerequisite** for both:

* Profile Position
* Profile Velocity

---

## `bool configureHoming(const HomingConfig& cfg)`

### Purpose

Apply all homing parameters from a single config struct.

### Typical fields in `HomingConfig`

* homing method
* homing offset
* search speed (switch)
* search speed (zero / index)
* acceleration
* timeout

### Typical internal behaviour

Calls:

* `setHomingMethod()`
* `setHomingOffset()`
* `setHomingSpeeds()`
* `setHomingAcceleration()`

### Why it exists

Convenient one-shot configuration before calling `home()`.

---

## `bool setHomingMethod(int8_t method)`

### Purpose

Set the homing strategy used by the drive.

### Object touched

* `0x6098:00` Homing Method

### Examples

The meaning of the method code depends on the drive manual and CiA 402 support.

### Notes

This should match the exact homing method required by the Festo drive configuration.

---

## `bool setHomingOffset(int32_t offset)`

### Purpose

Set the final home offset applied after homing completes.

### Object touched

* `0x607C:00` Home Offset

### Why it matters

Allows the logical zero position to be offset from the physical reference event.

---

## `bool setHomingSpeeds(uint32_t searchSwitch, uint32_t searchZero)`

### Purpose

Configure the two main homing speeds.

### Objects touched

* `0x6099:01` speed during search for switch
* `0x6099:02` speed during search for zero/index

### Why it matters

Homing often uses:

1. a faster approach to find a reference switch
2. a slower refinement move to find zero/index precisely

---

## `bool setHomingAcceleration(uint32_t accel)`

### Purpose

Set acceleration used during homing.

### Object touched

* `0x609A:00` Homing Acceleration

---

## `bool startHoming(uint32_t timeoutMs)`

### Purpose

Begin the homing procedure.

### Typical behaviour

1. ensure drive enabled
2. ensure mode = Homing (`0x6060 = 6`)
3. trigger homing start using controlword mode-specific action
4. wait until homing completes or fails

### Objects involved

* `0x6060:00` Modes of operation
* `0x6061:00` Mode display
* `0x6040:00` Controlword
* `0x6041:00` Statusword

### Return value

* `true` = homing completed successfully
* `false` = timeout / homing error / communication failure

### Notes

The exact controlword bits for homing start can be drive-specific in behaviour; confirm with Festo docs.

---

## `bool waitForHomingComplete(uint32_t timeoutMs)`

### Purpose

Block until homing either succeeds, fails, or times out.

### Typical behaviour

Polls statusword until:

* homing attained bit set → success
* homing error bit set → failure
* timeout exceeded → failure

### Objects touched

* `0x6041:00` Statusword

### Notes

Usually called internally by `startHoming()` or `home()`.

---

## `bool home()`

### Purpose

High-level “do the whole homing sequence” method.

### Typical sequence

1. ensure communication available
2. clear fault if needed (optional)
3. enable drive
4. set homing mode
5. apply homing config (if not already applied)
6. start homing
7. wait for completion
8. update internal `homed` state

### Why it exists

This is the **frontend-friendly** homing method.

### Recommended frontend command

```json
{"cmd":"home"}
```

### Return value

* `true` = homing succeeded
* `false` = homing failed / timed out / faulted

### Notes

This is one of the most important public methods in the class.

---

# 3. Velocity Methods

These methods implement **Profile Velocity Mode**.

For your project, velocity mode is used after successful homing.

---

## `bool configureProfileVelocity(const VelocityConfig& cfg)`

### Purpose

Apply all velocity-mode profile parameters from a single config struct.

### Typical fields in `VelocityConfig`

* acceleration
* deceleration
* max velocity
* quick-stop deceleration
* optional ramp values

### Typical internal calls

* `setVelocityRamp()`
* `setMaxVelocity()`
* optional `setQuickStopDecel()` if implemented

### Why it exists

Provides a single place to configure safe motion limits.

---

## `bool setTargetVelocity(int32_t velocity)`

### Purpose

Write the target velocity command.

### Object touched

* `0x60FF:00` Target Velocity

### Behaviour

The drive will accelerate/decelerate toward this velocity according to configured ramps.

### Notes

This is the core motion command in Profile Velocity mode.

---

## `bool setVelocityRamp(uint32_t accel, uint32_t decel)`

### Purpose

Configure acceleration and deceleration for velocity mode.

### Typical objects touched

* `0x6083:00` Profile Acceleration
* `0x6084:00` Profile Deceleration

### Notes

These objects may be shared with position mode depending on drive implementation.

---

## `bool setMaxVelocity(uint32_t maxVelocity)`

### Purpose

Set a maximum allowed velocity.

### Likely object

Often:

* `0x607F:00` Max Profile Velocity

But exact object usage may vary depending on Festo documentation.

### Notes

Useful for safety and preventing accidental overspeed commands.

---

## `bool startVelocity(int32_t velocity)`

### Purpose

High-level “start spinning in profile velocity mode” command.

### Typical sequence

1. ensure drive is homed
2. ensure drive enabled
3. ensure mode = Profile Velocity (`0x6060 = 3`)
4. write target velocity
5. optionally update moving state

### Why it exists

This is the clean frontend-friendly motion start function.

### Recommended frontend command

```json
{"cmd":"start_velocity","velocity":1500}
```

### Return value

* `true` = velocity command accepted
* `false` = not homed / not enabled / mode switch failed / communication error

### Notes

If the drive is already in Profile Velocity mode and enabled, this can simply change the target speed.

---

## `bool stopVelocity()`

### Purpose

Perform a **normal controlled stop** while in Profile Velocity mode.

### Typical behaviour

* write target velocity = `0`

### Object touched

* `0x60FF:00` Target Velocity

### Why this is preferred

This lets the drive decelerate according to its configured deceleration profile.

### Notes

This is generally preferable to disabling the drive for normal operation.

---

## `bool readActualVelocity(int32_t& velocity)`

### Purpose

Read the current measured/estimated velocity from the drive.

### Object touched

* `0x606C:00` Velocity Actual Value

### Why it exists

Useful for:

* frontend status display
* motion confirmation
* determining whether the axis is actually stopped

---

# 4. Position Methods

These methods implement **Profile Position Mode**.

---

## `bool configureProfilePosition(const PositionConfig& cfg)`

### Purpose

Apply all position-mode profile parameters from a single config struct.

### Typical fields in `PositionConfig`

* profile velocity
* profile acceleration
* profile deceleration
* end velocity
* motion profile type

### Typical internal calls

* `setProfileVelocity()`
* `setProfileAcceleration()`
* `setProfileDeceleration()`
* `setMotionProfileType()`
* optional end velocity setter if supported

### Why it exists

Provides a single place to define motion profile behaviour.

---

## `bool setTargetPosition(int32_t position)`

### Purpose

Write the target position for the next move.

### Object touched

* `0x607A:00` Target Position

### Notes

This does **not** always start the move by itself. In many CiA 402 implementations, a separate controlword action is required.

---

## `bool setProfileVelocity(uint32_t velocity)`

### Purpose

Set the move velocity used for profile position moves.

### Object touched

* `0x6081:00` Profile Velocity

---

## `bool setProfileAcceleration(uint32_t accel)`

### Purpose

Set acceleration for profile position moves.

### Object touched

* `0x6083:00` Profile Acceleration

---

## `bool setProfileDeceleration(uint32_t decel)`

### Purpose

Set deceleration for profile position moves.

### Object touched

* `0x6084:00` Profile Deceleration

---

## `bool setMotionProfileType(int16_t type)`

### Purpose

Set the motion profile shape/type if supported.

### Object touched

* `0x6086:00` Motion Profile Type

### Notes

Support and valid values depend on the drive.

---

## `bool moveAbsolute(int32_t position)`

### Purpose

Perform a **profile position absolute move**.

### Typical sequence

1. ensure drive is homed
2. ensure drive enabled
3. ensure mode = Profile Position (`0x6060 = 1`)
4. write target position
5. trigger new setpoint
6. optionally wait for target reached

### Why it exists

This is the main “move axis to X” command.

### Recommended frontend command

```json
{"cmd":"move_abs","position":10000}
```

### Return value

* `true` = move command accepted / started
* `false` = not homed / mode switch failed / communication failure

### Notes

Whether this method blocks until completion or only starts the move should be clearly documented in your implementation.

---

## `bool moveRelative(int32_t delta)`

### Purpose

Perform a **relative move** from the current position.

### Common implementation approach

1. read actual position
2. compute `newTarget = current + delta`
3. call `moveAbsolute(newTarget)`

### Alternative

Use CiA 402 relative positioning control bits if you later choose to implement that style.

### Why it exists

Useful for jog-style or incremental moves.

### Recommended frontend command

```json
{"cmd":"move_rel","delta":-500}
```

---

## `bool triggerNewSetpoint()`

### Purpose

Tell the drive to begin the prepared profile-position move.

### Typical behaviour

* toggle the controlword “new setpoint” bit (commonly bit 4)
* sometimes also use “change set immediately” bit depending on drive behaviour

### Objects touched

* `0x6040:00` Controlword

### Why it matters

In many CiA 402 implementations, writing target position alone does not start motion.

### Notes

This is usually an **internal helper** rather than a frontend-exposed method.

---

## `bool haltPositionMove()`

### Purpose

Request a controlled halt while in profile position mode.

### Typical behaviour

* set the controlword halt bit (commonly bit 8), or
* use Festo-specific supported stop behaviour

### Objects touched

* `0x6040:00` Controlword

### Notes

Exact behaviour must be confirmed against Festo documentation.

---

## `bool waitForTargetReached(uint32_t timeoutMs)`

### Purpose

Block until the position move completes, fails, or times out.

### Typical behaviour

Poll statusword until:

* target reached bit set → success
* fault bit set → failure
* timeout → failure

### Objects touched

* `0x6041:00` Statusword

### Why it exists

Useful for blocking move commands or higher-level sequences.

---

## `bool readActualPosition(int32_t& position)`

### Purpose

Read the current actual position.

### Object touched

* `0x6064:00` Position Actual Value

### Uses

* frontend display
* moveRelative calculations
* verifying final position

---

## `bool readDemandPosition(int32_t& position)`

### Purpose

Read the current internal demanded/commanded position.

### Object touched

* `0x6062:00` Position Demand Value

### Why it can be useful

Shows what the drive is trying to achieve internally, which can differ temporarily from actual position during motion.

---

# 5. Error Handling Methods

These methods retrieve and expose drive diagnostics.

---

## `bool readFaultHistory(FaultInfo& out)`

### Purpose

Read the standard CANopen fault/diagnostic history from the drive.

### Typical sequence

1. read statusword
2. if fault bit not set, optionally return success with `faultActive = false`
3. read `0x1001:00` Error Register
4. read `0x1003:00` number of stored entries
5. loop `0x1003:01 .. N` (bounded by a fixed max)

### Objects touched

* `0x6041:00` Statusword
* `0x1001:00` Error Register
* `0x1003:00` Error count
* `0x1003:01+` Error history entries

### Important note

`0x1003` is typically **history**, not necessarily “all currently active faults”.

### Recommended struct shape

```cpp
constexpr uint8_t MAX_FAULT_HISTORY = 8;

struct FaultInfo {
    bool faultActive = false;
    uint16_t statusword = 0;
    uint8_t errorRegister = 0;
    uint8_t reportedCount = 0;
    uint8_t storedCount = 0;
    uint32_t codes[MAX_FAULT_HISTORY] = {0};
};
```

### Why this is the right approach

* bounded memory
* deterministic runtime
* safe for embedded systems

---

## `bool getErrors(FaultInfo& out)`

### Purpose

Convenience wrapper for frontend diagnostics.

### Typical behaviour

May simply call `readFaultHistory(out)`.

### Why it exists

Provides a clean frontend-facing diagnostics method name.

### Recommended frontend command

```json
{"cmd":"get_errors"}
```

---

# Recommended Public vs Private Split

## Good public methods

These are the methods the `CommandManager` / frontend should mainly use:

* `connect()`
* `initialise()`
* `faultReset()`
* `enable()`
* `disable()`
* `quickStop()`
* `stop()`
* `home()`
* `startVelocity()`
* `stopVelocity()`
* `moveAbsolute()`
* `moveRelative()`
* `updateStatus()`
* `getStatus()`
* `getErrors()`

## Good private / internal helpers

These can stay internal unless you explicitly want them exposed:

* `setHomingMethod()`
* `setHomingOffset()`
* `setHomingSpeeds()`
* `setHomingAcceleration()`
* `setTargetVelocity()`
* `setVelocityRamp()`
* `setMaxVelocity()`
* `setTargetPosition()`
* `setProfileVelocity()`
* `setProfileAcceleration()`
* `setProfileDeceleration()`
* `setMotionProfileType()`
* `triggerNewSetpoint()`
* `haltPositionMove()`
* `waitForHomingComplete()`
* `waitForTargetReached()`

---

# Recommended Call Sequences

## 1. Startup / Initialisation

```text
connect()
updateStatus()
if faulted -> faultReset()
(optional) configure homing / motion profiles
```

---

## 2. Homing Sequence

```text
configureHoming(...)
home()
```

Equivalent expanded behaviour:

```text
enable()
set mode = homing
start homing
wait for completion
```

---

## 3. Start Velocity Motion

```text
if not homed -> reject
enable()
set mode = profile velocity
setTargetVelocity(v)
```

To stop normally:

```text
setTargetVelocity(0)
```

---

## 4. Start Position Move

```text
if not homed -> reject
enable()
set mode = profile position
setTargetPosition(pos)
triggerNewSetpoint()
(optional) waitForTargetReached()
```

---

## 5. Fault Recovery

```text
updateStatus()
if faulted:
    getErrors()
    faultReset()
    updateStatus()
```

---

# Common Failure Modes

## `connect()` fails

Possible causes:

* wrong node ID
* wrong baud rate
* drive not powered
* CAN wiring / termination issue
* node not started / not responding

## `enable()` fails

Possible causes:

* active fault still present
* invalid CiA 402 state transition
* drive not operational
* drive not ready to switch on

## `home()` fails

Possible causes:

* incorrect homing method
* wrong limit/reference input setup
* timeout too short
* homing speed/accel invalid
* drive faulted during homing

## `startVelocity()` fails

Possible causes:

* not homed
* drive not enabled
* mode switch failed
* target velocity outside limits

## `moveAbsolute()` fails

Possible causes:

* not homed
* mode switch failed
* target outside travel limits
* missing new setpoint trigger
* drive faulted during motion

## `readFaultHistory()` returns no useful codes

Possible causes:

* `0x1003` contains history, not current active code
* Festo stores better diagnostics in vendor-specific objects
* fault cleared but history remains

---

# Best Practices for Implementation

## 1. Keep motion methods intention-based

Good:

* `moveAbsolute(10000)`
* `startVelocity(1500)`

Avoid making the frontend manually set:

* mode
* controlword bits
* target objects in the correct order

## 2. Keep state cached

Use `updateStatus()` periodically and let the frontend read cached status.

## 3. Keep diagnostics bounded

Never allocate an arbitrary-length error list on the ESP32.
Use a fixed-size array.

## 4. Use mode-specific stop behaviour

* Velocity mode normal stop → target velocity = 0
* Position mode normal stop → halt / controlled stop
* Emergency-ish stop → quick stop

## 5. Distinguish “stop” from “disable”

* `stop()` = stop motion, keep drive ready
* `disable()` = turn off operation state

This distinction matters a lot for a good UI/UX.

---

# Suggested Frontend Mapping

## Commands to methods

| Frontend Command | FestoDrive Method                |
| ---------------- | -------------------------------- |
| `connect`        | `connect()`                      |
| `initialise`     | `initialise()`                   |
| `fault_reset`    | `faultReset()`                   |
| `enable`         | `enable()`                       |
| `disable`        | `disable()`                      |
| `quick_stop`     | `quickStop()`                    |
| `stop`           | `stop()`                         |
| `home`           | `home()`                         |
| `start_velocity` | `startVelocity(velocity)`        |
| `stop_velocity`  | `stopVelocity()`                 |
| `move_abs`       | `moveAbsolute(position)`         |
| `move_rel`       | `moveRelative(delta)`            |
| `get_status`     | `updateStatus()` + `getStatus()` |
| `get_errors`     | `getErrors()`                    |

---

# Summary

`FestoDrive` should be treated as the **main high-level motion API** for the ESP32 firmware.

Its public methods should:

* be easy to understand
* enforce correct sequencing
* hide CANopen / CiA 402 complexity
* provide safe, bounded, predictable behaviour

For your current project, the most important methods are:

* `connect()`
* `initialise()`
* `faultReset()`
* `enable()`
* `disable()`
* `quickStop()`
* `stop()`
* `home()`
* `startVelocity()`
* `stopVelocity()`
* `moveAbsolute()`
* `moveRelative()`
* `updateStatus()`
* `getStatus()`
* `getErrors()`

These are the methods that should define the frontend contract.

---

If useful, the next best doc would be a **method-by-method documentation page for `CiA402Drive`** as well, because that’s where the exact state machine / controlword logic lives.
