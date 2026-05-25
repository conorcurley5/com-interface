"use client"

import * as React from "react"
import { Delete, X, Check } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface NumberKeypadInputProps {
    label: string
    value: string
    onChange: (value: string) => void
    placeholder?: string
    allowDecimal?: boolean
    allowNegative?: boolean
    maxLength?: number
    className?: string
}

export function NumberKeypadInput({
    label,
    value,
    onChange,
    placeholder = "0",
    allowDecimal = true,
    allowNegative = false,
    maxLength = 12,
    className,
}: NumberKeypadInputProps) {
  const [open, setOpen] = React.useState(false)
  const [internalValue, setInternalValue] = React.useState(value)

  React.useEffect(() => {
    if (open) {
      setInternalValue(value)
    }
  }, [open, value])

  const handleKeyPress = (key: string) => {
    if (key === "backspace") {
      setInternalValue((prev) => prev.slice(0, -1))
      return
    }

    if (key === "clear") {
      setInternalValue("")
      return
    }

    if (key === "negative" && allowNegative) {
      setInternalValue((prev) => {
        if (prev.startsWith("-")) {
          return prev.slice(1)
        }
        return "-" + prev
      })
      return
    }

    if (key === "." && allowDecimal) {
      if (internalValue.includes(".")) return
      setInternalValue((prev) => (prev === "" ? "0." : prev + "."))
      return
    }

    if (internalValue.length >= maxLength) return

    // Handle leading zero
    if (internalValue === "0" && key !== ".") {
      setInternalValue(key)
      return
    }

    setInternalValue((prev) => prev + key)
  }

  const handleConfirm = () => {
    onChange(internalValue)
    setOpen(false)
  }

  const handleCancel = () => {
    setInternalValue(value)
    setOpen(false)
  }

  const displayValue = value || placeholder
  const isPlaceholder = !value

  return (
    <>
      {/* Trigger Input */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex flex-col h-12 grow-1 w-full items-center justify-between rounded-md border border-input bg-background px-4 py-2 text-left text-lg font-medium shadow-sm transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          className
        )}
      >
        {/* <span className="text-sm text-muted-foreground">{label}</span> */}
        <span className={cn(isPlaceholder && "text-muted-foreground flex flex-grow")}>
          {displayValue}
        </span>
      </button>

      {/* Keypad Modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="!max-w-2xl p-0 overflow-hidden"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">{label} Input</DialogTitle>
          <div className="grid grid-cols-2 min-h-[280px]">
            {/* Left Column - Display */}
            <div className="flex flex-col justify-center bg-muted/30 p-6 border-r">
              <span className="text-sm font-medium text-muted-foreground mb-2">
                {label}
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-5xl font-bold tracking-tight tabular-nums">
                  {internalValue || "0"}
                </span>
              </div>
            </div>

            {/* Right Column - Keypad */}
            <div className="flex flex-col p-4">
              {/* Number Grid */}
              <div className="grid grid-cols-3 gap-2 flex-1">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                  <Button
                    key={num}
                    variant="outline"
                    className="h-full text-2xl font-semibold hover:bg-accent active:scale-95 transition-transform"
                    onClick={() => handleKeyPress(num)}
                  >
                    {num}
                  </Button>
                ))}

                {/* Bottom Row */}
                {allowDecimal ? (
                  <Button
                    variant="outline"
                    className="h-full text-2xl font-semibold hover:bg-accent active:scale-95 transition-transform"
                    onClick={() => handleKeyPress(".")}
                    disabled={internalValue.includes(".")}
                  >
                    .
                  </Button>
                ) : allowNegative ? (
                  <Button
                    variant="outline"
                    className="h-full text-2xl font-semibold hover:bg-accent active:scale-95 transition-transform"
                    onClick={() => handleKeyPress("negative")}
                  >
                    +/-
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="h-full text-2xl font-semibold hover:bg-accent active:scale-95 transition-transform"
                    onClick={() => handleKeyPress("clear")}
                  >
                    C
                  </Button>
                )}

                <Button
                  variant="outline"
                  className="h-full text-2xl font-semibold hover:bg-accent active:scale-95 transition-transform"
                  onClick={() => handleKeyPress("0")}
                >
                  0
                </Button>

                <Button
                  variant="outline"
                  className="h-full text-xl hover:bg-accent active:scale-95 transition-transform"
                  onClick={() => handleKeyPress("backspace")}
                >
                  <Delete className="size-6" />
                </Button>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 mt-3">
                <Button
                  variant="outline"
                  className="h-12 text-base font-medium active:scale-95 transition-transform"
                  onClick={handleCancel}
                >
                  <X className="size-5 mr-1" />
                  Cancel
                </Button>
                <Button
                  className="h-12 text-base font-medium active:scale-95 transition-transform"
                  onClick={handleConfirm}
                >
                  <Check className="size-5 mr-1" />
                  Confirm
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
