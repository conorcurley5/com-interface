# Festo Servo Drive ESP32 Firmware Documentation

## Overview

This firmware provides an ESP32-based interface between a frontend application (e.g. Next.js over Serial) and a Festo servo drive over **CANopen / CiA 402**.

### Architecture

```text
Frontend (Next.js)
    ↓ Serial JSON (newline-delimited)
ESP32
    ├── SerialManager        (serial transport)
    ├── CommandManager       (JSON command routing)
    ├── CANInterface         (raw TWAI/CAN)
    ├── CANOpenNMT           (NMT commands)
    ├── CANOpenHeartbeat     (heartbeat monitoring)
    ├── CANOpenSDO           (SDO read/write)
    ├── CiA402Drive          (generic drive profile)
    └── FestoDrive           (application-specific drive API)
            ├── Control
            ├── Homing
            ├── Velocity
            ├── Position
            └── Error Handling
```

---

## Design Goals

* **Simple, robust, maintainable** embedded architecture
* **SDO-only** implementation (no PDO required for v1)
* Clear separation between:

  * transport
  * CANopen protocol
  * CiA 402 state machine
  * Festo-specific high-level actions
  * serial/frontend interface
* Safe, bounded memory usage suitable for ESP32 / Arduino-style firmware

---

# File / Class Breakdown

## 1. `CANInterface`

### Purpose

Low-level wrapper around the ESP32 TWAI driver.

### Responsibilities

* initialise the CAN/TWAI peripheral
* send standard 11-bit CAN frames
* receive CAN frames with timeout

### Typical API

* `begin()`
* `send(id, data, dlc, timeoutMs)`
* `receive(msg, timeoutMs)`

### Notes

This class should **only** know about CAN frames. It should not know anything about:

* NMT
* SDO
* CiA 402
* Festo motion logic

---

## 2. `CANOpenNMT`

### Purpose

Implements **CANopen NMT (Network Management)** commands.

### Responsibilities

* start node
* enter pre-operational
* reset node
* reset communication

### Typical CAN IDs

* NMT commands are sent on **COB-ID `0x000`**

### Typical methods

* `startNode(nodeId)`
* `enterPreOperational(nodeId)`
* `resetNode(nodeId)`
* `resetCommunication(nodeId)`

### Notes

NMT is used to manage the node’s CANopen communication state. It is **not** the CiA 402 motor state machine.

---

## 3. `CANOpenHeartbeat`

### Purpose

Monitors **CANopen heartbeat frames**.

### Responsibilities

* detect if the node is alive
* track current NMT state from heartbeat
* expose whether the node appears online

### Typical CAN IDs

* heartbeat frames are received on **`0x700 + nodeId`**

### Notes

Useful for:

* detecting whether the drive is responding at all
* showing frontend connection state
* future watchdog logic

For v1, heartbeat can be optional, but it’s nice to have.

---

## 4. `CANOpenSDO`

### Purpose

Implements **CANopen SDO expedited upload/download**.

### Responsibilities

* read/write object dictionary entries
* typed wrappers for common data sizes
* capture SDO abort codes
* filter SDO responses from the bus

### Core internal methods

* `uploadExpedited(...)`
* `downloadExpedited(...)`
* `waitForSdoResponse(...)`

### Public typed methods

* `readU8()` / `readI8()`
* `readU16()` / `readI16()`
* `readU32()` / `readI32()`
* `writeU8()` / `writeI8()`
* `writeU16()` / `writeI16()`
* `writeU32()` / `writeI32()`

### CAN IDs

* request: **`0x600 + nodeId`**
* response: **`0x580 + nodeId`**

### Notes

This class is **transport/protocol only**.
It should not know what `0x6040` means semantically. It should only know how to read/write CANopen objects.

---

## 5. `CiA402Drive`

### Purpose

Implements **generic CiA 402 drive-profile behaviour**.

### Responsibilities

* controlword / statusword handling
* mode switching
* state-machine transitions
* generic position/velocity/homing object access
* update cached drive status

### Core Objects

* `0x6040` Controlword
* `0x6041` Statusword
* `0x6060` Modes of operation
* `0x6061` Modes of operation display

### Typical high-level responsibilities

* `faultReset()`
* `enableOperation()`
* `disableOperation()`
* `quickStop()`
* `setMode()`
* `requireMode()`
* `updateStatus()`

### Notes

This class should remain **generic CiA 402** where possible.
It should avoid hardcoding Festo-specific behaviour unless absolutely necessary.

---

## 6. `FestoDrive`

### Purpose

Provides the **high-level application-facing API** for the drive.

This is the class the rest of the firmware (especially `CommandManager`) should call.

### Internal Structure

`FestoDrive` is split into logical groups:

* **Control**
* **Homing**
* **Velocity**
* **Position**
* **Error Handling**

### Recommended public API

#### Control

* `connect()`
* `initialise()`
* `faultReset()`
* `enable()`
* `disable()`
* `quickStop()`
* `stop()`
* `updateStatus()`
* `getStatus(...)`
* `isFaulted()`
* `isEnabled()`
* `isHomed()`
* `isMoving()`

#### Homing

* `configureHoming(...)`
* `setHomingMethod(...)`
* `setHomingOffset(...)`
* `setHomingSpeeds(...)`
* `setHomingAcceleration(...)`
* `startHoming(...)`
* `waitForHomingComplete(...)`
* `home()`

#### Velocity

* `configureProfileVelocity(...)`
* `setTargetVelocity(...)`
* `setVelocityRamp(...)`
* `setMaxVelocity(...)`
* `startVelocity(...)`
* `stopVelocity()`
* `readActualVelocity(...)`

#### Position

* `configureProfilePosition(...)`
* `setTargetPosition(...)`
* `setProfileVelocity(...)`
* `setProfileAcceleration(...)`
* `setProfileDeceleration(...)`
* `setMotionProfileType(...)`
* `moveAbsolute(...)`
* `moveRelative(...)`
* `triggerNewSetpoint()`
* `haltPositionMove()`
* `waitForTargetReached(...)`
* `readActualPosition(...)`
* `readDemandPosition(...)`

#### Error Handling

* `readFaultHistory(...)`
* `getErrors(...)`

### Notes

This is the class where it’s okay to expose “friendly” functions like:

* `home()`
* `startVelocity(velocity)`
* `moveAbsolute(position)`

That keeps the serial/frontend interface simple.

---

## 7. `SerialManager`

### Purpose

Handles **Serial JSON transport** only.

### Responsibilities

* read newline-delimited JSON commands from the frontend
* parse JSON into `JsonDocument`
* serialize responses / status updates back to the frontend

### Notes

This class should **not** know what commands mean semantically.
It should only know how to:

* read a line
* parse JSON
* send JSON

### Expected transport format

**Newline-delimited JSON** (one JSON object per line)

Example command:

```json
{"cmd":"move_abs","position":10000}
```

Example response:

```json
{"ok":true,"cmd":"move_abs"}
```

---

## 8. `CommandManager`

### Purpose

Maps frontend JSON commands to `FestoDrive` methods.

### Responsibilities

* validate command payloads
* call the correct `FestoDrive` method
* build JSON success/error responses
* provide `get_status` / `get_errors` style commands

### Example commands

* `connect`
* `initialise`
* `fault_reset`
* `enable`
* `disable`
* `quick_stop`
* `stop`
* `home`
* `start_velocity`
* `stop_velocity`
* `move_abs`
* `move_rel`
* `get_status`
* `get_errors`
* `sdo_read`
* `sdo_write`

### Notes

This class should be the **single command routing layer** between the frontend and drive logic.

---

# Main Runtime Flow (`main.cpp`)

## Object Wiring

Typical object construction order:

```cpp
CANInterface can;
CANOpenNMT nmt(can);
CANOpenHeartbeat heartbeat;
CANOpenSDO sdo(can);

DriveStatus driveState{};

CiA402Drive cia402(nodeId, sdo, &driveState);
FestoDrive festo(nodeId, cia402, sdo, nmt, &driveState);

SerialManager serial;
CommandManager commands(serial, festo, sdo, &driveState);
```

### Why this order?

* `CANInterface` is the lowest-level dependency
* `NMT` and `SDO` depend on CAN
* `CiA402Drive` depends on SDO
* `FestoDrive` depends on CiA 402 / SDO / NMT
* `CommandManager` depends on `FestoDrive`

---

## Setup / Initialisation

Typical `setup()` flow:

1. `Serial.begin(...)`
2. `can.begin()`
3. initialise manager objects
4. optionally send NMT start node
5. optionally perform initial `updateStatus()`
6. send a `ready` JSON message to frontend

---

## Main Loop Pattern

Recommended loop:

1. Read any serial commands available
2. Parse and dispatch all complete command lines
3. Execute drive actions synchronously
4. Periodically poll status (`updateStatus()`)
5. Periodically send status updates to frontend
6. Repeat

### Suggested timing

* command handling: every loop
* status polling: every **50–200 ms**
* heartbeat processing: opportunistically when CAN frames arrive

---

# CANopen / CiA 402 Behaviour

## NMT vs CiA 402

These are different layers:

### NMT

Controls the **CANopen communication state** of the node.

Examples:

* pre-operational
* operational
* reset node

### CiA 402

Controls the **motor drive state machine**.

Examples:

* ready to switch on
* switched on
* operation enabled
* fault
* quick stop active

---

## Core CiA 402 Objects

### State Machine

* `0x6040:00` Controlword
* `0x6041:00` Statusword

### Mode Management

* `0x6060:00` Modes of operation
* `0x6061:00` Modes of operation display

### Position Mode

* `0x607A:00` Target position
* `0x6064:00` Position actual value
* `0x6062:00` Position demand value
* `0x6081:00` Profile velocity
* `0x6083:00` Profile acceleration
* `0x6084:00` Profile deceleration
* `0x6086:00` Motion profile type

### Velocity Mode

* `0x60FF:00` Target velocity
* `0x606C:00` Velocity actual value
* `0x6083:00` Profile acceleration
* `0x6084:00` Profile deceleration
* `0x6085:00` Quick stop deceleration

### Homing

* `0x6098:00` Homing method
* `0x6099:01` Homing speed during search for switch
* `0x6099:02` Homing speed during search for zero
* `0x609A:00` Homing acceleration
* `0x607C:00` Home offset

---

# Controlword Reference

Common whole controlword values:

```text
0x0006 = Shutdown
0x0007 = Switch On / Disable Operation
0x000F = Enable Operation
0x0000 = Disable Voltage
0x0002 = Quick Stop
0x0080 = Fault Reset
```

## Practical usage

### Enable sequence

```text
0x0006 -> 0x0007 -> 0x000F
```

### Normal velocity stop

```text
Write target velocity = 0
```

### Controlled stop in position mode

* use halt bit or Festo-specific supported stop behaviour

### Quick stop

```text
0x0002
```

---

# Diagnostics / Error Handling

## Standard CANopen diagnostic objects

### `0x1001:00` Error Register

1-byte summary of current error class.

### `0x1003` Pre-defined Error Field

Error history / stored fault log.

Typical structure:

```text
0x1003:00 = number of stored entries
0x1003:01 = newest error
0x1003:02 = older error
...
```

### `0x6041:00` Statusword

Indicates current drive state including:

* fault active
* warning
* quick stop active
* target reached
* homing attained / homing error (mode-dependent)

---

## Important implementation note

`0x1003` is typically **history**, not necessarily “all currently active faults”.

So if the drive is faulted:

* the newest entry is usually the most relevant
* older entries may just be previous faults

### Recommended approach

* fixed-size fault buffer (e.g. 5–8 entries)
* store:

  * `reportedCount`
  * `storedCount`
  * `codes[]`

Example:

```cpp
constexpr uint8_t MAX_FAULT_HISTORY = 8;
```

This avoids arbitrary dynamic memory allocation.

---

# Frontend Serial Protocol

## Transport

* **newline-delimited JSON**
* one command per line
* one response per line
* periodic status updates can also be newline-delimited JSON

---

## Suggested Commands

### Control

```json
{"cmd":"connect"}
{"cmd":"initialise"}
{"cmd":"fault_reset"}
{"cmd":"enable"}
{"cmd":"disable"}
{"cmd":"quick_stop"}
{"cmd":"stop"}
```

### Homing

```json
{"cmd":"home"}
{"cmd":"configure_homing","method":35,"offset":0,"searchSwitch":1000,"searchZero":200,"accel":1000}
```

### Velocity

```json
{"cmd":"start_velocity","velocity":1500}
{"cmd":"stop_velocity"}
```

### Position

```json
{"cmd":"move_abs","position":10000}
{"cmd":"move_rel","delta":-500}
```

### Status / Diagnostics

```json
{"cmd":"get_status"}
{"cmd":"get_errors"}
```

### Raw SDO (optional for debugging)

```json
{"cmd":"sdo_read","index":24641,"sub":0,"type":"u16"}
{"cmd":"sdo_write","index":24640,"sub":0,"type":"u16","value":15}
```

---

# Suggested JSON Responses

## Success

```json
{"ok":true,"cmd":"move_abs"}
```

## Error

```json
{"ok":false,"cmd":"move_abs","error":"not_homed"}
```

## Status

```json
{
  "type":"status",
  "fault":false,
  "enabled":true,
  "homed":true,
  "mode":1,
  "positionActual":12345,
  "velocityActual":0,
  "statusword":4663
}
```

## Errors

```json
{
  "type":"errors",
  "faultActive":true,
  "errorRegister":16,
  "reportedCount":3,
  "storedCount":3,
  "codes":[
    "0x23100000",
    "0x32100000",
    "0x00000000"
  ]
}
```

---

# Known Issues / Things to Fix

## 1. `FestoDrive` constructor should include `nodeId`

If `nodeId` is used by methods but not initialised, behaviour will be undefined.

Recommended constructor shape:

```cpp
FestoDrive(uint8_t nodeId, CiA402Drive& cia402, CANOpenSDO& sdo, CANOpenNMT& nmt, DriveStatus* state)
```

---

## 2. `FestoDrive::faultReset()` recursion bug

If `FestoDrive::faultReset()` calls itself instead of the underlying drive implementation, it will recurse forever.

It should call the `CiA402Drive` method (or whichever lower-level method is intended).

---

## 3. `CiA402Drive::updateStatus()` should be implemented fully

This should populate cached status values from the drive.

Recommended minimum fields to update:

* statusword
* active mode
* actual position
* actual velocity
* fault flag
* enabled flag
* homed flag
* moving flag

---

## 4. `CANOpenSDO::waitForSdoResponse()` logic

Ensure it:

* waits for **`0x580 + nodeId`**
* ignores unrelated traffic
* handles timeout correctly
* does **not** skip valid received frames by accident

---

# Recommended Next Improvements

## v1 (current scope)

* SDO-only implementation
* profile position
* profile velocity
* homing required before motion
* serial JSON control

## v2

* better Festo-specific diagnostic decoding
* vendor-specific active fault object support
* more robust statusword bit decoding
* command queue / non-blocking long operations
* central CAN receive dispatcher

## v3

* optional PDO support for faster status updates
* watchdog / heartbeat timeout handling
* FreeRTOS task split if needed

---

# Practical Development Advice

## Keep public API high-level

Expose methods like:

* `home()`
* `startVelocity(v)`
* `moveAbsolute(pos)`
* `stop()`

Avoid forcing the frontend to micromanage:

* controlword sequences
* individual object writes
* statusword interpretation

---

## Keep memory bounded

Avoid arbitrary dynamic containers for diagnostics on the ESP32.
Prefer:

* fixed-size arrays
* known caps
* predictable JSON sizes

---

## Keep SDO transport generic

Do not mix:

* raw SDO frame handling
  with:
* motion logic

That separation will save a lot of pain later.

---

# Summary

This firmware stack is designed around a clean layered architecture:

* **CANInterface** = raw CAN transport
* **CANOpenNMT** = network management
* **CANOpenHeartbeat** = node alive / NMT monitoring
* **CANOpenSDO** = object dictionary access
* **CiA402Drive** = generic servo-drive state machine
* **FestoDrive** = friendly high-level motion API
* **SerialManager** = serial JSON transport
* **CommandManager** = frontend command routing

This gives you:

* simple frontend integration
* maintainable embedded code
* safe SDO-only control for v1
* a clear upgrade path later

---

If you want, the next most useful thing is probably a **“Frontend API Reference”** markdown page that documents the exact JSON commands/responses expected by your Next.js app.
