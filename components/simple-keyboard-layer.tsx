"use client"

import * as React from "react"
import Keyboard from "react-simple-keyboard"
import "react-simple-keyboard/build/css/index.css"
import type SimpleKeyboard from "simple-keyboard"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const textLayout = {
  default: [
    "` 1 2 3 4 5 6 7 8 9 0 - = {bksp}",
    "{tab} q w e r t y u i o p [ ] \\",
    "{lock} a s d f g h j k l ; ' {enter}",
    "{shift} z x c v b n m , . / {shift}",
    ".com @ {space}",
  ],
  shift: [
    "~ ! @ # $ % ^ & * ( ) _ + {bksp}",
    "{tab} Q W E R T Y U I O P { } |",
    '{lock} A S D F G H J K L : " {enter}',
    "{shift} Z X C V B N M < > ? {shift}",
    ".com @ {space}",
  ],
}

const numericLayout = {
  default: [
    "1 2 3",
    "4 5 6",
    "7 8 9",
    "- 0 . {bksp}",
  ],
}

const buttonTheme = [
  {
    class: "simple-keyboard-action",
    buttons: "{bksp} {tab} {lock} {enter} {shift}",
  },
  {
    class: "simple-keyboard-space",
    buttons: "{space}",
  },
]

function isKeyboardInput(target: EventTarget | null): target is HTMLInputElement {
  if (!(target instanceof HTMLInputElement)) return false
  if (target.disabled || target.readOnly) return false
  if (target.dataset.simpleKeyboard === "false") return false

  const type = target.type || "text"
  return ![
    "button",
    "checkbox",
    "color",
    "file",
    "hidden",
    "image",
    "radio",
    "range",
    "reset",
    "submit",
  ].includes(type)
}

function isNumericInput(input: HTMLInputElement) {
  return input.type === "number" || input.inputMode === "numeric" || input.inputMode === "decimal"
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(input, "value")?.set
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )?.set

  if (valueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter?.call(input, value)
  } else if (prototypeValueSetter) {
    prototypeValueSetter.call(input, value)
  } else {
    input.value = value
  }

  input.dispatchEvent(new Event("input", { bubbles: true }))
  input.dispatchEvent(new Event("change", { bubbles: true }))
}

export function SimpleKeyboardLayer() {
  const [activeInput, setActiveInput] = React.useState<HTMLInputElement | null>(null)
  const [inputValue, setInputValue] = React.useState("")
  const [layoutName, setLayoutName] = React.useState("default")
  const keyboardRef = React.useRef<SimpleKeyboard | null>(null)
  const keyboardContainerRef = React.useRef<HTMLDivElement | null>(null)

  const preserveInputFocus = React.useCallback(
    (
      event:
        | React.PointerEvent<HTMLDivElement>
        | React.MouseEvent<HTMLDivElement>
        | React.TouchEvent<HTMLDivElement>
    ) => {
      const target = event.target

      if (
        target instanceof Element &&
        target.closest("[data-simple-keyboard-close]")
      ) {
        return
      }

      event.preventDefault()
      activeInput?.focus({ preventScroll: true })
    },
    [activeInput]
  )

  React.useEffect(() => {
    const handleFocusIn = (event: FocusEvent) => {
      if (!isKeyboardInput(event.target)) return

      setActiveInput(event.target)
      setInputValue(event.target.value)
      setLayoutName("default")
    }

    const handleInput = (event: Event) => {
      if (event.target === activeInput && activeInput) {
        setInputValue(activeInput.value)
      }
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (isKeyboardInput(target)) return
      if (target instanceof Node && keyboardContainerRef.current?.contains(target)) return
      if (target instanceof Element && target.closest(".simple-keyboard")) return

      setActiveInput(null)
    }

    document.addEventListener("focusin", handleFocusIn)
    document.addEventListener("input", handleInput)
    document.addEventListener("pointerdown", handlePointerDown)

    return () => {
      document.removeEventListener("focusin", handleFocusIn)
      document.removeEventListener("input", handleInput)
      document.removeEventListener("pointerdown", handlePointerDown)
    }
  }, [activeInput])

  React.useEffect(() => {
    keyboardRef.current?.setInput(inputValue)
  }, [inputValue])

  const handleChange = React.useCallback(
    (value: string) => {
      if (!activeInput) return

      setInputValue(value)
      setNativeInputValue(activeInput, value)
      activeInput.focus({ preventScroll: true })
    },
    [activeInput]
  )

  const handleKeyPress = React.useCallback((button: string) => {
    if (button === "{shift}" || button === "{lock}") {
      setLayoutName((current) => (current === "default" ? "shift" : "default"))
    }
  }, [])

  if (!activeInput) return null

  const numeric = isNumericInput(activeInput)

  return (
    <div
      ref={keyboardContainerRef}
      data-simple-keyboard-layer
      className="fixed inset-x-0 bottom-0 z-[70] border-t bg-background/95 p-3 shadow-2xl backdrop-blur supports-backdrop-filter:bg-background/80"
      onPointerDownCapture={preserveInputFocus}
      onMouseDownCapture={preserveInputFocus}
      onTouchStartCapture={preserveInputFocus}
    >
      <div className="mx-auto grid max-w-4xl gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="truncate font-mono text-xs text-muted-foreground">
            {inputValue || " "}
          </div>
          <Button
            data-simple-keyboard-close
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setActiveInput(null)}
          >
            Close
          </Button>
        </div>
        <Keyboard
          keyboardRef={(keyboard) => {
            keyboardRef.current = keyboard
            keyboard.setInput(inputValue)
          }}
          layout={numeric ? numericLayout : textLayout}
          layoutName={numeric ? "default" : layoutName}
          onChange={handleChange}
          onKeyPress={handleKeyPress}
          preventMouseDownDefault
          stopMouseDownPropagation
          stopMouseUpPropagation
          buttonTheme={buttonTheme}
          display={{
            "{bksp}": "Backspace",
            "{enter}": "Enter",
            "{shift}": "Shift",
            "{lock}": "Caps",
            "{tab}": "Tab",
            "{space}": "Space",
          }}
          theme={cn(
            "hg-theme-default rcom-simple-keyboard",
            numeric && "rcom-simple-keyboard-numeric"
          )}
        />
      </div>
    </div>
  )
}
