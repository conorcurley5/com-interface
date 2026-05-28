# Frontend Serial API Reference

## Overview

The frontend communicates with the ESP32 using **newline-delimited JSON over Serial**.

Each command is sent as one JSON object followed by a newline:

```json
{"cmd":"get_status"}
```

The ESP32 replies with one JSON object followed by a newline:

```json
{"ok":true,"cmd":"get_status","status":{"fault":false,"enabled":true}}
```

---

# Transport Rules

## Encoding

Use UTF-8 text over Serial.

## Framing

Each message must end with `\n`.

```text
{"cmd":"enable"}\n
{"cmd":"get_status"}\n
```

## Message Format

All frontend commands should be JSON objects.

Minimum command shape:

```json
{
  "cmd": "command_name"
}
```

Recommended command shape:

```json
{
  "id": 1,
  "cmd": "command_name"
}
```

The `id` field is optional, but recommended. It lets the frontend match responses to requests.

---

# Standard Response Format

## Successful response

```json
{
  "id": 1,
  "cmd": "enable",
  "ok": true
}
```

## Failed response

```json
{
  "id": 1,
  "cmd": "enable",
  "ok": false,
  "error": "enable_failed"
}
```

## Error response fields

| Field     | Type    | Description                        |
| --------- | ------- | ---------------------------------- |
| `ok`      | boolean | Whether the command succeeded      |
| `cmd`     | string  | Command that was attempted         |
| `id`      | number  | Echoed request ID if provided      |
| `error`   | string  | Machine-readable error code        |
| `message` | string  | Optional human-readable error text |

---

# Common Error Codes

| Error                 | Meaning                                                  |
| --------------------- | -------------------------------------------------------- |
| `json_parse_error`    | ESP32 could not parse the JSON command                   |
| `missing_cmd`         | Command did not include a `cmd` field                    |
| `unknown_command`     | Command name is not recognised                           |
| `missing_parameter`   | Required field was not provided                          |
| `invalid_parameter`   | Field was provided but invalid                           |
| `drive_not_connected` | Drive did not respond over CANopen                       |
| `not_homed`           | Motion command rejected because homing has not completed |
| `drive_faulted`       | Command rejected because the drive is faulted            |
| `enable_failed`       | Drive could not be enabled                               |
| `mode_switch_failed`  | Drive did not enter requested mode                       |
| `sdo_read_failed`     | SDO read failed                                          |
| `sdo_write_failed`    | SDO write failed                                         |
| `sdo_abort`           | Drive returned an SDO abort code                         |
| `timeout`             | Operation timed out                                      |

---

# Command Summary

## Control

| Command       | Purpose                           |
| ------------- | --------------------------------- |
| `ping`        | Check ESP32 serial link           |
| `connect`     | Check CANopen drive communication |
| `initialise`  | Run startup/init sequence         |
| `fault_reset` | Clear drive fault                 |
| `enable`      | Enable drive operation            |
| `disable`     | Disable drive operation           |
| `quick_stop`  | Request CiA 402 quick stop        |
| `stop`        | Normal controlled stop            |

## Homing

| Command            | Purpose               |
| ------------------ | --------------------- |
| `configure_homing` | Set homing parameters |
| `home`             | Run homing procedure  |

## Velocity

| Command              | Purpose                         |
| -------------------- | ------------------------------- |
| `configure_velocity` | Set velocity profile parameters |
| `start_velocity`     | Start profile velocity motion   |
| `stop_velocity`      | Stop velocity motion normally   |

## Position

| Command              | Purpose                         |
| -------------------- | ------------------------------- |
| `configure_position` | Set position profile parameters |
| `move_abs`           | Move to absolute position       |
| `move_rel`           | Move relative distance          |

## Status / Diagnostics

| Command      | Purpose                              |
| ------------ | ------------------------------------ |
| `get_status` | Get current cached/live drive status |
| `get_errors` | Read drive fault/error history       |

## Expert / Debug

| Command          | Purpose                     |
| ---------------- | --------------------------- |
| `sdo_read`       | Raw SDO read                |
| `sdo_write`      | Raw SDO write               |
| `nmt_start`      | Send NMT start node         |
| `nmt_preop`      | Send NMT pre-operational    |
| `nmt_reset_node` | Reset CANopen node          |
| `nmt_reset_comm` | Reset CANopen communication |

---

# Control Commands

## `ping`

### Purpose

Check that the ESP32 serial interface is alive.

### Request

```json
{"id":1,"cmd":"ping"}
```

### Response

```json
{"id":1,"cmd":"ping","ok":true,"pong":true}
```

---

## `connect`

### Purpose

Check that the Festo drive is reachable over CANopen.

### Request

```json
{"id":2,"cmd":"connect"}
```

### Success response

```json
{"id":2,"cmd":"connect","ok":true,"connected":true}
```

### Failure response

```json
{"id":2,"cmd":"connect","ok":false,"error":"drive_not_connected"}
```

### Notes

This does not enable the motor. It only checks communication.

---

## `initialise`

### Purpose

Run the ESP32 startup sequence for the drive.

Typical behaviour may include:

* NMT start
* SDO communication check
* status update
* optional fault reset
* optional default config load

### Request

```json
{"id":3,"cmd":"initialise"}
```

### Response

```json
{"id":3,"cmd":"initialise","ok":true}
```

---

## `fault_reset`

### Purpose

Attempt to clear a CiA 402 fault.

### Request

```json
{"id":4,"cmd":"fault_reset"}
```

### Response

```json
{"id":4,"cmd":"fault_reset","ok":true}
```

### Notes

If the underlying cause of the fault is still present, the drive may immediately fault again.

---

## `enable`

### Purpose

Enable drive operation.

Internally this usually runs the CiA 402 sequence:

```text
Shutdown → Switch On → Enable Operation
```

### Request

```json
{"id":5,"cmd":"enable"}
```

### Response

```json
{"id":5,"cmd":"enable","ok":true,"enabled":true}
```

---

## `disable`

### Purpose

Disable operation while keeping the drive available over CANopen.

### Request

```json
{"id":6,"cmd":"disable"}
```

### Response

```json
{"id":6,"cmd":"disable","ok":true,"enabled":false}
```

---

## `quick_stop`

### Purpose

Request a CiA 402 quick stop.

### Request

```json
{"id":7,"cmd":"quick_stop"}
```

### Response

```json
{"id":7,"cmd":"quick_stop","ok":true}
```

### Notes

This is not the same as normal stop. It uses quick-stop behaviour configured on the drive.

---

## `stop`

### Purpose

Request a normal controlled stop.

Behaviour depends on active mode:

* Profile Velocity: target velocity is set to `0`
* Profile Position: position halt / controlled stop behaviour is used

### Request

```json
{"id":8,"cmd":"stop"}
```

### Response

```json
{"id":8,"cmd":"stop","ok":true}
```

---

# Homing Commands

## `configure_homing`

### Purpose

Set homing parameters before calling `home`.

### Request

```json
{
  "id": 10,
  "cmd": "configure_homing",
  "method": 35,
  "offset": 0,
  "searchSwitch": 1000,
  "searchZero": 200,
  "accel": 1000,
  "timeoutMs": 30000
}
```

### Fields

| Field          | Type | Required | Description                    |
| -------------- | ---: | -------: | ------------------------------ |
| `method`       |  int |      yes | Homing method code             |
| `offset`       |  int |       no | Home offset                    |
| `searchSwitch` | uint |      yes | Speed searching for switch     |
| `searchZero`   | uint |      yes | Speed searching for zero/index |
| `accel`        | uint |      yes | Homing acceleration            |
| `timeoutMs`    | uint |       no | Homing timeout in ms           |

### Response

```json
{"id":10,"cmd":"configure_homing","ok":true}
```

---

## `home`

### Purpose

Run the homing procedure.

### Request

```json
{"id":11,"cmd":"home"}
```

### Success response

```json
{"id":11,"cmd":"home","ok":true,"homed":true}
```

### Failure response

```json
{"id":11,"cmd":"home","ok":false,"error":"homing_failed"}
```

### Notes

Profile Position and Profile Velocity commands should generally be rejected until homing is complete.

---

# Velocity Commands

## `configure_velocity`

### Purpose

Set profile velocity parameters.

### Request

```json
{
  "id": 20,
  "cmd": "configure_velocity",
  "accel": 1000,
  "decel": 1000,
  "maxVelocity": 5000,
  "quickStopDecel": 5000
}
```

### Fields

| Field            | Type | Required | Description                |
| ---------------- | ---: | -------: | -------------------------- |
| `accel`          | uint |      yes | Profile acceleration       |
| `decel`          | uint |      yes | Profile deceleration       |
| `maxVelocity`    | uint |       no | Maximum permitted velocity |
| `quickStopDecel` | uint |       no | Quick stop deceleration    |

### Response

```json
{"id":20,"cmd":"configure_velocity","ok":true}
```

---

## `start_velocity`

### Purpose

Start spinning in Profile Velocity mode.

### Request

```json
{"id":21,"cmd":"start_velocity","velocity":1500}
```

### Fields

| Field      | Type | Required | Description     |
| ---------- | ---: | -------: | --------------- |
| `velocity` |  int |      yes | Target velocity |

### Success response

```json
{"id":21,"cmd":"start_velocity","ok":true,"velocity":1500}
```

### Failure examples

```json
{"id":21,"cmd":"start_velocity","ok":false,"error":"not_homed"}
```

```json
{"id":21,"cmd":"start_velocity","ok":false,"error":"mode_switch_failed"}
```

---

## `stop_velocity`

### Purpose

Stop Profile Velocity motion by commanding target velocity `0`.

### Request

```json
{"id":22,"cmd":"stop_velocity"}
```

### Response

```json
{"id":22,"cmd":"stop_velocity","ok":true,"velocity":0}
```

---

# Position Commands

## `configure_position`

### Purpose

Set profile position motion parameters.

### Request

```json
{
  "id": 30,
  "cmd": "configure_position",
  "profileVelocity": 2000,
  "accel": 1000,
  "decel": 1000,
  "endVelocity": 0,
  "motionProfileType": 0
}
```

### Fields

| Field               | Type | Required | Description                         |
| ------------------- | ---: | -------: | ----------------------------------- |
| `profileVelocity`   | uint |      yes | Velocity used during position moves |
| `accel`             | uint |      yes | Profile acceleration                |
| `decel`             | uint |      yes | Profile deceleration                |
| `endVelocity`       | uint |       no | Velocity at end of move             |
| `motionProfileType` |  int |       no | Motion profile type                 |

### Response

```json
{"id":30,"cmd":"configure_position","ok":true}
```

---

## `move_abs`

### Purpose

Move to an absolute position in Profile Position mode.

### Request

```json
{"id":31,"cmd":"move_abs","position":10000}
```

### Fields

| Field      | Type | Required | Description              |
| ---------- | ---: | -------: | ------------------------ |
| `position` |  int |      yes | Absolute target position |

### Success response

```json
{"id":31,"cmd":"move_abs","ok":true,"position":10000}
```

### Failure examples

```json
{"id":31,"cmd":"move_abs","ok":false,"error":"not_homed"}
```

```json
{"id":31,"cmd":"move_abs","ok":false,"error":"move_failed"}
```

---

## `move_rel`

### Purpose

Move relative to the current position.

### Request

```json
{"id":32,"cmd":"move_rel","delta":-500}
```

### Fields

| Field   | Type | Required | Description              |
| ------- | ---: | -------: | ------------------------ |
| `delta` |  int |      yes | Relative movement amount |

### Response

```json
{"id":32,"cmd":"move_rel","ok":true,"delta":-500}
```

---

# Status / Diagnostics Commands

## `get_status`

### Purpose

Read current drive status.

### Request

```json
{"id":40,"cmd":"get_status"}
```

### Response

```json
{
  "id": 40,
  "cmd": "get_status",
  "ok": true,
  "status": {
    "connected": true,
    "fault": false,
    "warning": false,
    "enabled": true,
    "homed": true,
    "moving": false,
    "statusword": 4663,
    "controlword": 15,
    "activeMode": 1,
    "requestedMode": 1,
    "positionActual": 12345,
    "positionDemand": 12345,
    "targetPosition": 12345,
    "velocityActual": 0,
    "targetVelocity": 0
  }
}
```

### Notes

Some fields may be omitted if not implemented yet.

---

## `get_errors`

### Purpose

Read current fault status and stored error history.

### Request

```json
{"id":41,"cmd":"get_errors"}
```

### Response

```json
{
  "id": 41,
  "cmd": "get_errors",
  "ok": true,
  "faultActive": true,
  "statusword": 4664,
  "errorRegister": 16,
  "reportedCount": 3,
  "storedCount": 3,
  "codes": [
    "0x23100000",
    "0x32100000",
    "0x00000000"
  ]
}
```

### Notes

`reportedCount` is the count reported by the drive.
`storedCount` is how many entries the ESP32 actually read into its fixed-size buffer.

---

# Raw SDO Debug Commands

These commands are useful during commissioning and debugging.

They should be hidden behind an “expert mode” in the frontend.

---

## `sdo_read`

### Purpose

Read a raw object dictionary entry.

### Request

```json
{
  "id": 50,
  "cmd": "sdo_read",
  "index": "6041",
  "sub": 0,
  "type": "u16"
}
```

### Fields

| Field   |             Type | Required | Description                         |
| ------- | ---------------: | -------: | ----------------------------------- |
| `index` | string or number |      yes | Object index, preferably hex string |
| `sub`   |           number |      yes | Subindex                            |
| `type`  |           string |      yes | Data type                           |

### Supported types

```text
u8, i8, u16, i16, u32, i32
```

### Success response

```json
{
  "id": 50,
  "cmd": "sdo_read",
  "ok": true,
  "index": "6041",
  "sub": 0,
  "type": "u16",
  "value": 4663
}
```

### Failure response

```json
{
  "id": 50,
  "cmd": "sdo_read",
  "ok": false,
  "error": "sdo_read_failed"
}
```

---

## `sdo_write`

### Purpose

Write a raw object dictionary entry.

### Request

```json
{
  "id": 51,
  "cmd": "sdo_write",
  "index": "6040",
  "sub": 0,
  "type": "u16",
  "value": 15
}
```

### Fields

| Field   |             Type | Required | Description                         |
| ------- | ---------------: | -------: | ----------------------------------- |
| `index` | string or number |      yes | Object index, preferably hex string |
| `sub`   |           number |      yes | Subindex                            |
| `type`  |           string |      yes | Data type                           |
| `value` |           number |      yes | Value to write                      |

### Success response

```json
{
  "id": 51,
  "cmd": "sdo_write",
  "ok": true,
  "index": "6040",
  "sub": 0,
  "type": "u16"
}
```

### Warning

Raw SDO writes can put the drive into unsafe or invalid states. Use only for debugging/commissioning.

---

# NMT Debug Commands

These are low-level CANopen network management commands.

---

## `nmt_start`

### Request

```json
{"id":60,"cmd":"nmt_start"}
```

### Response

```json
{"id":60,"cmd":"nmt_start","ok":true}
```

---

## `nmt_preop`

### Request

```json
{"id":61,"cmd":"nmt_preop"}
```

### Response

```json
{"id":61,"cmd":"nmt_preop","ok":true}
```

---

## `nmt_reset_node`

### Request

```json
{"id":62,"cmd":"nmt_reset_node"}
```

### Response

```json
{"id":62,"cmd":"nmt_reset_node","ok":true}
```

---

## `nmt_reset_comm`

### Request

```json
{"id":63,"cmd":"nmt_reset_comm"}
```

### Response

```json
{"id":63,"cmd":"nmt_reset_comm","ok":true}
```

---

# Periodic Status Updates

The ESP32 may send unsolicited status messages periodically.

## Example

```json
{
  "type": "status",
  "seq": 123,
  "ms": 456789,
  "connected": true,
  "fault": false,
  "warning": false,
  "enabled": true,
  "homed": true,
  "moving": false,
  "activeMode": 1,
  "statusword": 4663,
  "positionActual": 12345,
  "velocityActual": 0
}
```

## Recommended frontend behaviour

* Treat messages with `type: "status"` as asynchronous updates.
* Do not require a matching request ID.
* Use them to update UI state.

---

# Recommended UI Flows

## 1. Connect flow

```text
ping
connect
get_status
```

## 2. Startup flow

```text
connect
initialise
get_status
```

## 3. Fault recovery flow

```text
get_status
get_errors
fault_reset
get_status
```

## 4. Homing flow

```text
configure_homing
home
get_status
```

## 5. Velocity flow

```text
configure_velocity
enable
start_velocity
stop_velocity
```

## 6. Position flow

```text
configure_position
enable
move_abs
get_status
```

---

# Frontend Safety Recommendations

## Disable motion buttons unless:

* connected = true
* fault = false
* homed = true
* enabled = true

## Always expose:

* Stop
* Quick Stop
* Disable
* Fault Reset
* Get Errors

## Hide raw SDO by default

Raw SDO access should be behind an expert/debug panel.

---

# Minimal Frontend Command Set

If you only implement the essentials first, use:

```text
ping
connect
get_status
fault_reset
enable
disable
quick_stop
stop
home
start_velocity
stop_velocity
move_abs
move_rel
get_errors
sdo_read
sdo_write
```

That is enough for v1.

---

# Notes on Units

The frontend should not assume that position and velocity values are physical units unless the firmware explicitly defines scaling.

For v1, values may be raw drive units:

* position: encoder increments / user units
* velocity: drive-configured velocity units
* acceleration: drive-configured acceleration units

A later frontend layer can convert:

```text
mm ↔ drive units
rpm ↔ drive units
rev ↔ encoder counts
```

---

# Summary

The frontend should communicate with the ESP32 using simple, high-level JSON commands.

The frontend should send intent:

```json
{"cmd":"move_abs","position":10000}
```

not low-level CiA 402 sequences:

```json
{"cmd":"sdo_write","index":"6040","value":15}
```

Raw SDO remains available for debugging, but the normal UI should use the high-level command API.
