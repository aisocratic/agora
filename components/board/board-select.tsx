"use client"

import { useId } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@aisocratic/design/components/select"

export function BoardSelect({ value, options, onValueChange, placeholder, ...props }: {
  value: string
  options: readonly { value: string; label: string }[]
  onValueChange: (value: string) => void
  placeholder?: string
  id?: string
  "aria-label"?: string
  disabled?: boolean
}) {
  const empty = `${useId()}-empty`
  const encode = (value: string) => value === "" && options.some(option => option.value === "") ? empty : value
  return <Select value={encode(value)} onValueChange={value => onValueChange(value === empty ? "" : value)} disabled={props.disabled}>
    <SelectTrigger {...props} className="agora-select"><SelectValue placeholder={placeholder} /></SelectTrigger>
    <SelectContent className="agora-select-content">{options.map(option => <SelectItem key={option.value} value={encode(option.value)}>{option.label}</SelectItem>)}</SelectContent>
  </Select>
}
