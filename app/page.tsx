"use client"

import * as React from "react"
import {
  Activity,
  AlertCircle,
  Cable,
  CheckCircle2,
  ChevronsLeft,
  ChevronsRight,
  CircleStop,
  Gauge,
  Goal,
  Home,
  Loader2,
  MoreVertical,
  PlugZap,
  Power,
  PowerOff,
  RefreshCcw,
  RotateCcw,
  Send,
  ShieldAlert,
  Wifi,
  Zap,
  ZapOff,
} from "lucide-react"

import { AppSidebar } from "@/components/app-sidebar"
import { NumberKeypadInput } from "@/components/number_keypad_input"
import { SiteHeader } from "@/components/site-header"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { Slider } from "@/components/ui/slider"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type SerialRequest = {
  id?: number
  cmd: string
  [key: string]: unknown
}

type SerialResponse = {
  id?: number
  cmd?: string
  ok?: boolean
  error?: string
  message?: string
  type?: string
  status?: DriveStatus
  codes?: string[]
  [key: string]: unknown
}

type DriveStatus = {
  connected?: boolean
  fault?: boolean
  warning?: boolean
  enabled?: boolean
  homed?: boolean
  moving?: boolean
  statusword?: number
  controlword?: number
  activeMode?: number
  requestedMode?: number
  positionActual?: number
  positionDemand?: number
  targetPosition?: number
  velocityActual?: number
  targetVelocity?: number
}

type SerialPortLike = {
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
  open: (options: { baudRate: number }) => Promise<void>
  close: () => Promise<void>
}

type SerialNavigator = Navigator & {
  serial?: {
    requestPort: () => Promise<SerialPortLike>
  }
}

type PendingRequest = {
  resolve: (response: SerialResponse) => void
  reject: (error: Error) => void
  timeout: number
}

const BAUD_RATE = 115200
const COMMAND_TIMEOUT_MS = 5000
const STATUSWORD_HOMED_MASK = 0x1000

function formatBoolean(value: boolean | undefined) {
  if (value === undefined) return "Unknown"
  return value ? "Yes" : "No"
}

function statusTone(value: boolean | undefined, goodWhenTrue = true) {
  if (value === undefined) return "outline"
  return value === goodWhenTrue ? "default" : "destructive"
}

function parseInteger(value: string, fallback = 0) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export default function Page() {
  const [serialConnected, setSerialConnected] = React.useState(false)
  const [serialWritable, setSerialWritable] = React.useState(false)
  const [openingSerial, setOpeningSerial] = React.useState(false)
  const [busyCommand, setBusyCommand] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState<DriveStatus>({})
  const [statuswordHomed, setStatuswordHomed] = React.useState<boolean | undefined>(undefined)
  const [lastResponse, setLastResponse] = React.useState<SerialResponse | null>(null)
  const [lastError, setLastError] = React.useState<string | null>(null)
  const [log, setLog] = React.useState<string[]>([])
  const [speed, setSpeed] = React.useState("1500")
  const [position, setPosition] = React.useState("10000")
  const [velocityMax, setVelocityMax] = React.useState("1500")
  const [velocityAccel, setVelocityAccel] = React.useState("1000")
  const [velocityDecel, setVelocityDecel] = React.useState("1000")
  const [velocityQuickStopDecel, setVelocityQuickStopDecel] = React.useState("2000")
  const [positionVelocity, setPositionVelocity] = React.useState("2000")
  const [positionAccel, setPositionAccel] = React.useState("1000")
  const [positionDecel, setPositionDecel] = React.useState("1000")
  const [positionEndVelocity, setPositionEndVelocity] = React.useState("0")
  const [positionMotionProfileType, setPositionMotionProfileType] = React.useState("0")
  const [customCommand, setCustomCommand] = React.useState("")

  const readerRef = React.useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const writerRef = React.useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null)
  const portRef = React.useRef<SerialPortLike | null>(null)
  const pendingRef = React.useRef(new Map<number, PendingRequest>())
  const nextIdRef = React.useRef(1)

  const appendLog = React.useCallback((entry: string) => {
    setLog((current) => [
      `${new Date().toLocaleTimeString()} ${entry}`,
      ...current,
    ].slice(0, 8))
  }, [])

  React.useEffect(() => {
    if (lastError) {
      toast.error(lastError)
    }
  }, [lastError])

  const applyMessage = React.useCallback((message: SerialResponse) => {
    setLastResponse(message)

    if (message.type === "status") {
      setStatus((current) => ({ ...current, ...message }))
      return
    }

    if (message.status) {
      setStatus((current) => ({ ...current, ...message.status }))
    }

    if (typeof message.connected === "boolean") {
      setStatus((current) => ({ ...current, connected: message.connected as boolean }))
    }

    if (typeof message.enabled === "boolean") {
      setStatus((current) => ({ ...current, enabled: message.enabled as boolean }))
    }

    if (typeof message.homed === "boolean") {
      setStatus((current) => ({ ...current, homed: message.homed as boolean }))
    }

    if (message.ok === false) {
      setLastError(
        String(message.message ?? message.error ?? "Drive command failed")
      )
    } else {
      setLastError(null)
    }
  }, [])

  const handleIncomingLine = React.useCallback(
    (line: string) => {
      if (!line.trim()) return

      try {
        const message = JSON.parse(line) as SerialResponse
        appendLog(`RX ${line}`)
        applyMessage(message)

        if (typeof message.id === "number") {
          const pending = pendingRef.current.get(message.id)
          if (pending) {
            window.clearTimeout(pending.timeout)
            pendingRef.current.delete(message.id)
            pending.resolve(message)
          }
        }
      } catch {
        setLastError(`Could not parse serial response: ${line}`)
      }
    },
    [appendLog, applyMessage]
  )

  const readLoop = React.useCallback(
    async (activePort: SerialPortLike) => {
      const decoder = new TextDecoder()
      let buffer = ""

      while (activePort.readable) {
        const reader = activePort.readable.getReader()
        readerRef.current = reader

        try {
          while (true) {
            const { value, done } = await reader.read()
            if (done) return
            buffer += decoder.decode(value, { stream: true })

            const lines = buffer.split("\n")
            buffer = lines.pop() ?? ""
            for (const line of lines) {
              handleIncomingLine(line.trim())
            }
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            return
          }

          setLastError(error instanceof Error ? error.message : "Serial read failed")
          break
        } finally {
          reader.releaseLock()
          readerRef.current = null
        }
      }
    },
    [handleIncomingLine]
  )

  const sendCommand = React.useCallback(
    async (request: SerialRequest) => {
      if (!writerRef.current) {
        throw new Error("Serial port is not connected")
      }

      const id = nextIdRef.current++
      const payload = { ...request, id }
      const line = `${JSON.stringify(payload)}\n`

      setBusyCommand(request.cmd)
      appendLog(`TX ${line.trim()}`)

      const responsePromise = new Promise<SerialResponse>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          pendingRef.current.delete(id)
          reject(new Error(`${request.cmd} timed out`))
        }, COMMAND_TIMEOUT_MS)

        pendingRef.current.set(id, { resolve, reject, timeout })
      })

      try {
        await writerRef.current.write(new TextEncoder().encode(line))
        const response = await responsePromise

        if (response.ok === false) {
          throw new Error(String(response.message ?? response.error ?? "Command failed"))
        }

        return response
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Serial command failed")
        throw error
      } finally {
        setBusyCommand(null)
      }
    },
    [appendLog]
  )

  const runCommand = React.useCallback(
    async (request: SerialRequest) => {
      try {
        return await sendCommand(request)
      } catch {
        return null
      }
    },
    [sendCommand]
  )

  const connectSerial = React.useCallback(async () => {
    const serial = (navigator as SerialNavigator).serial

    if (!serial) {
      setLastError("Web Serial is not available in this browser")
      return
    }

    try {
      setOpeningSerial(true)
      const selectedPort = await serial.requestPort()
      await selectedPort.open({ baudRate: BAUD_RATE })

      const writer = selectedPort.writable?.getWriter()
      if (!writer) {
        throw new Error("Serial port is not writable")
      }

      writerRef.current = writer
      portRef.current = selectedPort
      setSerialConnected(true)
      setSerialWritable(true)
      setLastError(null)
      appendLog(`Opened serial port at ${BAUD_RATE} baud`)
      void readLoop(selectedPort)
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "Could not open serial port")
    } finally {
      setOpeningSerial(false)
    }
  }, [appendLog, readLoop])

  const disconnectSerial = React.useCallback(async () => {
    try {
      for (const pending of pendingRef.current.values()) {
        window.clearTimeout(pending.timeout)
        pending.reject(new Error("Serial port disconnected"))
      }
      pendingRef.current.clear()

      await readerRef.current?.cancel()
      writerRef.current?.releaseLock()
      writerRef.current = null
      await portRef.current?.close()
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "Could not close serial port")
    } finally {
      portRef.current = null
      setSerialConnected(false)
      setSerialWritable(false)
      appendLog("Closed serial port")
    }
  }, [appendLog])

  React.useEffect(() => {
    const pendingRequests = pendingRef.current

    return () => {
      for (const pending of pendingRequests.values()) {
        window.clearTimeout(pending.timeout)
      }
      writerRef.current?.releaseLock()
      void readerRef.current?.cancel()
      void portRef.current?.close()
    }
  }, [])

  // const runConnectFlow = React.useCallback(async () => {
  //   // if (!(await runCommand({ cmd: "ping" }))) return
  //   // if (!(await runCommand({ cmd: "connect" }))) return
  //   await runCommand({ cmd: "get_status" })
  // }, [runCommand])

  const runStartupFlow = React.useCallback(async () => {
    // if (!(await runCommand({ cmd: "connect" }))) return
    if (!(await runCommand({ cmd: "initialise" }))) return
    await runCommand({ cmd: "get_status" })
  }, [runCommand])

  const configureProfileVelocity = React.useCallback(async () => {
    const maxVelocity = Math.abs(parseInteger(velocityMax, 1500)) * 100
    const acceleration = Math.abs(parseInteger(velocityAccel, 1000)) * 100
    const deceleration = Math.abs(parseInteger(velocityDecel, 1000)) * 100
    const quickStopDeceleration = Math.abs(parseInteger(velocityQuickStopDecel, 2000)) * 100

    await runCommand({
      cmd: "configure_velocity",
      acceleration,
      deceleration,
      maxVelocity,
      quickStopDeceleration,
    })
  }, [runCommand, velocityAccel, velocityDecel, velocityMax, velocityQuickStopDecel])

  const configureProfilePosition = React.useCallback(async () => {
    const profileVelocity = Math.abs(parseInteger(positionVelocity, 2000)) * 100
    const profileAcceleration = Math.abs(parseInteger(positionAccel, 1000)) * 100
    const profileDeceleration = Math.abs(parseInteger(positionDecel, 1000)) * 100

    await runCommand({
      cmd: "configure_position",
      profileVelocity,
      profileAcceleration,
      profileDeceleration,
      endVelocity: parseInteger(positionEndVelocity),
      motionProfileType: parseInteger(positionMotionProfileType),
    })
  }, [
    positionAccel,
    positionDecel,
    positionEndVelocity,
    positionMotionProfileType,
    positionVelocity,
    runCommand,
  ])

  const startVelocity = React.useCallback(
    async (direction: -1 | 1) => {
      const targetSpeed = parseInteger(speed) * direction * 100

      await runCommand({ cmd: "set_velocity", value: targetSpeed })
    },
    [runCommand, speed]
  )

  const moveAbsolute = React.useCallback(async () => {
    await runCommand({ cmd: "move_abs", position: parseInteger(position) })
    // await runCommand({ cmd: "get_status" })
  }, [position, runCommand])

  const sendCustomCommand = React.useCallback(async () => {
    const trimmedCommand = customCommand.trim()

    if (!trimmedCommand) return

    if (trimmedCommand.startsWith("{")) {
      try {
        const parsedCommand = JSON.parse(trimmedCommand) as unknown

        if (
          !parsedCommand ||
          Array.isArray(parsedCommand) ||
          typeof parsedCommand !== "object" ||
          typeof (parsedCommand as { cmd?: unknown }).cmd !== "string"
        ) {
          setLastError("Custom JSON command must include a string cmd field")
          return
        }

        await runCommand(parsedCommand as SerialRequest)
        return
      } catch {
        setLastError("Custom command is not valid JSON")
        return
      }
    }

    await runCommand({ cmd: trimmedCommand })
  }, [customCommand, runCommand])

  const serialReady = serialConnected && serialWritable

  React.useEffect(() => {
    if (typeof status.statusword !== "number") return

    setStatuswordHomed(Boolean(status.statusword & STATUSWORD_HOMED_MASK))
  }, [status.statusword])

  const driveReady = Boolean(
    serialReady &&
    // status.connected &&
    status.enabled &&
    statuswordHomed &&
    !status.fault
  )
  const motionBlocked = !driveReady || Boolean(busyCommand)

  React.useEffect(() => {
    console.log(motionBlocked, driveReady, busyCommand)
    console.log("Connected: ", status.connected)
    console.log("Enabled: ", status.enabled)
    console.log("Homed: ", statuswordHomed)
    console.log("Fault: ", status.fault)
  }, [driveReady, busyCommand, status, statuswordHomed])

  React.useEffect(() => {
    console.log("Speed: ", speed)
  }, [speed])

  const telemetry = [
    ["Position actual", status.positionActual],
    ["Position demand", status.positionDemand],
    ["Target position", status.targetPosition],
    ["Velocity actual", status.velocityActual],
    ["Target velocity", status.targetVelocity],
    ["Statusword", status.statusword],
    ["Controlword", status.controlword],
    ["Active mode", status.activeMode],
  ] as const
  const targetVelocity = parseInteger(speed)
  const targetVelocityMax = Math.max(1, Math.abs(parseInteger(velocityMax, 1500)))

  return (
    <SidebarProvider
      defaultOpen={false}
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <div className="servo-site-header">
          <SiteHeader>
            <div className="servo-command-row flex flex-wrap gap-2">
              {busyCommand ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {busyCommand}
                </div>
              ) : null}

              <Button
                variant={serialReady ? "outline" : "default"}
                onClick={serialReady ? disconnectSerial : connectSerial}
                disabled={openingSerial || Boolean(busyCommand)}
                size="icon"
              >
                {openingSerial ? (
                  <Loader2 className="animate-spin" />
                ) : serialReady ? (
                  <PowerOff />
                ) : (
                  <Cable />
                )}
                {/* {openingSerial
                  ? "Opening"
                  : serialReady
                    ? "Disconnect"
                    : "Connect"} */}
              </Button>
              <Button
                variant="outline"
                onClick={runStartupFlow}
                disabled={!serialReady || Boolean(busyCommand)}
                size="icon"
              >
                <Zap />
                {/* Initialise  */}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => void runCommand({ cmd: "get_status" })}
                disabled={!serialReady || Boolean(busyCommand)}
              >
                <RefreshCcw />
              </Button>
            </div>

            <Separator orientation="vertical" />

            <Badge  variant={serialReady ? "default" : "destructive"}>
              <Cable />
            </Badge>

            {status.fault ? (<Badge variant={statusTone(status.fault, false)}>
              <ShieldAlert />
            </Badge>) : null}
          </SiteHeader>
        </div>

        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2 h-full">
            <div className="servo-main flex flex-col gap-4 p-4 md:gap-6 md:p-6 h-full">

              <Tabs defaultValue="telemetry" className="servo-tabs  gap-4" orientation="vertical">
                <TabsList className="servo-tab-list w-fit">
                  <TabsTrigger value="telemetry" className="flex flex-col text-xs"><Wifi className="size-6" />Telemetry</TabsTrigger>
                  <TabsTrigger value="profile-velocity" className="flex flex-col text-xs"><Gauge className="size-6" />Velocity</TabsTrigger>
                  <TabsTrigger value="profile-position" className="flex flex-col text-xs"><Goal className="size-6" />Position</TabsTrigger>
                  <TabsTrigger value="diagnostics" className="flex flex-col text-xs"><Activity className="size-6" />Diagnostics</TabsTrigger>
                </TabsList>

                <TabsContent value="profile-velocity" className="servo-tab-content">
                  <Card className="servo-motion-card" size="sm">
                    <CardHeader>
                      <CardTitle>Velocity Mode</CardTitle>
                      <CardDescription className="servo-description">
                        Configure velocity parameters separately from sending a target velocity.
                      </CardDescription>
                    </CardHeader>
                    <Separator />
                    <CardContent className="servo-motion-content flex-row grow-1 gap-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col items-center py-4 bg-muted rounded-md">
                          <p className="text-xl font-semibold">{status.targetVelocity ?? 0}</p>
                          <p className="text-xs mt-2 opacity-75">Target Velocity</p>
                        </div>
                        <div className="flex flex-col items-center py-4 bg-muted rounded-md">
                          <p className="text-xl font-semibold">{status.velocityActual ?? 0}</p>
                          <p className="text-xs mt-2 opacity-75">Actual Velocity</p>
                        </div>
                      </div>
                      <Separator className="my-4" />
                      <div className="grid gap-2">
                        <div className="flex items-center justify-between gap-3">
                          <Label htmlFor="target-velocity" className="text-xs">Set Target Velocity</Label>
                          <span className="font-mono text-sm text-muted-foreground">
                            {targetVelocity}
                          </span>
                        </div>
                        <Slider
                          id="target-velocity"
                          min={0}
                          max={targetVelocityMax}
                          step={1}
                          value={[Math.min(Math.max(targetVelocity, 0), targetVelocityMax)]}
                          onValueChange={(value) => setSpeed(String(value[0] ?? 0))}
                        />
                      </div>
                      <Accordion
                        type="single"
                        collapsible
                        className="mt-4 rounded-lg border bg-card/50 px-3"
                      >
                        <AccordionItem value="velocity-config">
                          <AccordionTrigger>Velocity Config</AccordionTrigger>
                          <AccordionContent>
                            <form
                              className="grid gap-4"
                              onSubmit={(event) => {
                                event.preventDefault()
                                void configureProfileVelocity()
                              }}
                            >
                              <div className="grid gap-3 grid-cols-2">
                                <div className="grid gap-2">
                                  <Label htmlFor="velocity-config-accel">Acceleration</Label>
                                  <Input
                                    id="velocity-config-accel"
                                    inputMode="numeric"
                                    value={velocityAccel}
                                    onChange={(event) => setVelocityAccel(event.target.value)}
                                  />
                                </div>
                                <div className="grid gap-2">
                                  <Label htmlFor="velocity-config-decel">Deceleration</Label>
                                  <Input
                                    id="velocity-config-decel"
                                    inputMode="numeric"
                                    value={velocityDecel}
                                    onChange={(event) => setVelocityDecel(event.target.value)}
                                  />
                                </div>
                                <div className="grid gap-2">
                                  <Label htmlFor="velocity-config-max">Max velocity</Label>
                                  <Input
                                    id="velocity-config-max"
                                    inputMode="numeric"
                                    value={velocityMax}
                                    onChange={(event) => setVelocityMax(event.target.value)}
                                  />
                                </div>
                                <div className="grid gap-2">
                                  <Label htmlFor="velocity-config-quick-stop">
                                    Quick stop deceleration
                                  </Label>
                                  <Input
                                    id="velocity-config-quick-stop"
                                    inputMode="numeric"
                                    value={velocityQuickStopDecel}
                                    onChange={(event) => setVelocityQuickStopDecel(event.target.value)}
                                  />
                                </div>
                              </div>
                              <Button
                                type="submit"
                                disabled={!serialReady || Boolean(busyCommand)}
                              >
                                {busyCommand === "configure_velocity" ? (
                                  <Loader2 className="animate-spin" />
                                ) : (
                                  <Zap />
                                )}
                                Submit Config
                              </Button>
                            </form>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    </CardContent>
                    <CardFooter className="servo-control-footer flex flex-wrap items-center gap-2">
                      <ButtonGroup className="servo-jog-group [--radius:9999rem]">
                        <Button
                          variant="outline"
                          onClick={() => void startVelocity(-1)}
                          disabled={motionBlocked}
                        >
                          <ChevronsLeft />
                          Reverse
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void runCommand({ cmd: "stop_velocity" })}
                          disabled={!serialReady || Boolean(busyCommand)}
                        >
                          <CircleStop />
                          Stop
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void startVelocity(1)}
                          disabled={motionBlocked}
                        >
                          <ChevronsRight />
                          Forward
                        </Button>
                      </ButtonGroup>
                    </CardFooter>
                  </Card>
                </TabsContent>

                <TabsContent value="profile-position" className="servo-tab-content">
                  <Card className="servo-motion-card" size="sm">
                    <CardHeader>
                      <CardTitle>Profile Position</CardTitle>
                      <CardDescription className="servo-description">
                        Configure profile position parameters separately from sending an absolute target.
                      </CardDescription>
                    </CardHeader>
                    <Separator />
                    <CardContent className="servo-motion-content flex-row grow-1  gap-4">
                      <div className="grid grid-cols-3 gap-4">
                        <div className="flex flex-col items-center py-4 bg-muted rounded-md">
                          <p className="text-xl font-semibold">{status.positionActual ?? 0}</p>
                          <p className="text-xs mt-2 opacity-75">Actual Position</p>
                        </div>
                        <div className="flex flex-col items-center py-4 bg-muted rounded-md">
                          <p className="text-xl font-semibold">{status.targetPosition ?? 0}</p>
                          <p className="text-xs mt-2 opacity-75">Position Demand</p>
                        </div>
                        <div className="flex flex-col items-center py-4 bg-muted rounded-md">
                          <p className="text-xl font-semibold">{status.positionDemand ?? 0}</p>
                          <p className="text-xs mt-2 opacity-75">Target Position</p>
                        </div>
                      </div>
                      <Separator className="my-4" />
                      <div className="grid gap-2">
                        <Label>Absolute position</Label>
                        <NumberKeypadInput
                          label="Position"
                          value={position}
                          onChange={setPosition}
                          placeholder="0"
                          allowDecimal={false}
                          allowNegative
                        />
                      </div>
                      <Accordion
                        type="single"
                        collapsible
                        className="mt-4 rounded-lg border bg-card/50 px-3"
                      >
                        <AccordionItem value="position-config">
                          <AccordionTrigger>Position Config</AccordionTrigger>
                          <AccordionContent>
                            <form
                              className="grid gap-4"
                              onSubmit={(event) => {
                                event.preventDefault()
                                void configureProfilePosition()
                              }}
                            >
                              <div className="grid gap-3 grid-cols-2">
                                <div className="grid gap-2">
                                  <Label htmlFor="position-config-velocity">Profile velocity</Label>
                                  <Input
                                    id="position-config-velocity"
                                    inputMode="numeric"
                                    value={positionVelocity}
                                    onChange={(event) => setPositionVelocity(event.target.value)}
                                  />
                                </div>
                                <div className="grid gap-2">
                                  <Label htmlFor="position-config-accel">Acceleration</Label>
                                  <Input
                                    id="position-config-accel"
                                    inputMode="numeric"
                                    value={positionAccel}
                                    onChange={(event) => setPositionAccel(event.target.value)}
                                  />
                                </div>
                                <div className="grid gap-2">
                                  <Label htmlFor="position-config-decel">Deceleration</Label>
                                  <Input
                                    id="position-config-decel"
                                    inputMode="numeric"
                                    value={positionDecel}
                                    onChange={(event) => setPositionDecel(event.target.value)}
                                  />
                                </div>
                                <div className="grid gap-2">
                                  <Label htmlFor="position-config-end-velocity">End velocity</Label>
                                  <Input
                                    id="position-config-end-velocity"
                                    inputMode="numeric"
                                    value={positionEndVelocity}
                                    onChange={(event) => setPositionEndVelocity(event.target.value)}
                                  />
                                </div>
                                <div className="grid gap-2 col-span-2">
                                  <Label htmlFor="position-config-motion-profile">
                                    Motion profile type
                                  </Label>
                                  <Input
                                    id="position-config-motion-profile"
                                    inputMode="numeric"
                                    value={positionMotionProfileType}
                                    onChange={(event) => setPositionMotionProfileType(event.target.value)}
                                  />
                                </div>
                              </div>
                              <Button
                                type="submit"
                                disabled={!serialReady || Boolean(busyCommand)}
                              >
                                {busyCommand === "configure_position" ? (
                                  <Loader2 className="animate-spin" />
                                ) : (
                                  <Zap />
                                )}
                                Submit Config
                              </Button>
                            </form>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    </CardContent>
                    <CardFooter className="servo-control-footer flex flex-wrap items-center gap-2">
                      <Button
                        onClick={() => void moveAbsolute()}
                        disabled={motionBlocked}
                      >
                        <ChevronsRight />
                        Move
                      </Button>
                    </CardFooter>
                  </Card>
                </TabsContent>

                <TabsContent value="diagnostics" className="servo-tab-content">
                  <Card className="servo-motion-card" size="sm">
                    <CardHeader>
                      <CardTitle>Diagnostics</CardTitle>
                      <CardDescription className="servo-description">
                        Fault history and recent serial frames for commissioning.
                      </CardDescription>
                    </CardHeader>
                    <Separator />
                    <CardContent className="grid gap-4">
                      <form
                        className="grid gap-2 md:grid-cols-[1fr_auto]"
                        onSubmit={(event) => {
                          event.preventDefault()
                          void sendCustomCommand()
                        }}
                      >
                        <Input
                          value={customCommand}
                          onChange={(event) => setCustomCommand(event.target.value)}
                          placeholder='get_status or {"cmd":"get_status"}'
                          spellCheck={false}
                          className="font-mono"
                        />
                        <Button
                          type="submit"
                          disabled={
                            !serialReady ||
                            Boolean(busyCommand) ||
                            !customCommand.trim()
                          }
                        >
                          <Send />
                          Send
                        </Button>
                      </form>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          onClick={() => void runCommand({ cmd: "get_errors" })}
                          disabled={!serialReady || Boolean(busyCommand)}
                        >
                          <AlertCircle />
                          Get Errors
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void runCommand({ cmd: "nmt_start" })}
                          disabled={!serialReady || Boolean(busyCommand)}
                        >
                          <Zap />
                          NMT Start
                        </Button>
                      </div>

                      {lastResponse?.codes ? (
                        <Alert>
                          <CheckCircle2 />
                          <AlertTitle>Error history</AlertTitle>
                          <AlertDescription>{lastResponse.codes.join(", ")}</AlertDescription>
                        </Alert>
                      ) : null}

                      <div className="servo-diagnostics-log grid gap-2">
                        {log.length ? (
                          log.map((entry) => (
                            <div
                              key={entry}
                              className="rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground"
                            >
                              {entry}
                            </div>
                          ))
                        ) : (
                          <div className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                            No serial traffic yet.
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="telemetry" className="servo-tab-content">
                  <Card className="servo-telemetry-card" size="sm">
                    <CardHeader>
                      <CardTitle>Telemetry</CardTitle>
                      <CardDescription className="servo-description">Latest status frame or command response.</CardDescription>
                    </CardHeader>
                    <Separator />
                    <CardContent className="grid grid-cols-2 gap-4">
                      <StatusTile label="Enabled" value={formatBoolean(status.enabled)} good={status.enabled} />
                      <StatusTile label="Homed" value={formatBoolean(statuswordHomed)} good={statuswordHomed} />
                      <StatusTile label="Moving" value={formatBoolean(status.moving)} good={!status.moving} />
                      <StatusTile label="Warning" value={formatBoolean(status.warning)} good={!status.warning} />

                      <Separator className=" col-span-2" />
                      <Table>
                        <TableBody>
                          {telemetry.slice(0,5).map(([label, value]) => (
                            <TableRow key={label}>
                              <TableCell className="text-muted-foreground">{label}</TableCell>
                              <TableCell className="text-right font-mono">
                                {value ?? "-"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <Table>
                        <TableBody>
                          {telemetry.slice(5).map(([label, value]) => (
                            <TableRow key={label}>
                              <TableCell className="text-muted-foreground">{label}</TableCell>
                              <TableCell className="text-right font-mono">
                                {value ?? "-"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              <div className="fixed right-4 bottom-4 z-40 flex items-end gap-2 md:right-6 md:bottom-6">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="lg"
                      className="h-11 rounded-full px-4 shadow-lg"
                      disabled={Boolean(busyCommand)}
                    >
                      <MoreVertical />
                      {/* Control */}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" side="top" sideOffset={10} className="min-w-44">
                    <DropdownMenuLabel>Drive Actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={!serialReady || Boolean(busyCommand)}
                      onSelect={() => void runCommand({ cmd: "enable" })}
                    >
                      <Power />
                      Enable
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!serialReady || Boolean(busyCommand) || Boolean(status.fault)}
                      onSelect={() => void runCommand({ cmd: "home" })}
                    >
                      <Home />
                      Home
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={!serialReady || Boolean(busyCommand)}
                      onSelect={() => void runCommand({ cmd: "stop" })}
                    >
                      <CircleStop />
                      Stop
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!serialReady || Boolean(busyCommand)}
                      onSelect={() => void runCommand({ cmd: "disable" })}
                    >
                      <ZapOff />
                      Disable
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={!serialReady || Boolean(busyCommand)}
                      onSelect={() => void runCommand({ cmd: "fault_reset" })}
                    >
                      <RotateCcw />
                      Fault Reset
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  variant="destructive"
                  size="lg"
                  className="h-11 rounded-full border-destructive px-4 shadow-lg"
                  onClick={() => void runCommand({ cmd: "quick_stop" })}
                  disabled={!serialReady || Boolean(busyCommand)}
                >
                  <ShieldAlert />
                  {/* Quick Stop */}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function StatusTile({
  label,
  value,
  good,
}: {
  label: string
  value: string
  good: boolean | undefined
}) {
  return (
    <div className={cn("servo-status-tile rounded-md border bg-card px-3 py-2 flex flex-row items-center justify-between", good ? "border-green-600 bg-green-900/10 text-green-600" : "")}>
      <div className="flex flex-row gap-2 items-center">
        {good ? (
          <CheckCircle2 className="size-4 text-green-600" />
        ) : (
          <AlertCircle className="size-4 text-muted-foreground" />
        )}
        <div className="servo-status-tile-label text-xs font-medium text-muted-foreground">{label}</div>
      </div>
      <div className="servo-status-tile-value mt-1 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">{value}</span>
        
      </div>
    </div>
  )
}
