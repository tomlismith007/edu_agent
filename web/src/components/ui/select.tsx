import * as React from "react"
import { cn } from "@/lib/utils"

function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "border-input bg-muted text-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex h-8 w-full rounded-full border px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export { Select }
