import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/**
 * Semantic action variants. Important actions default to 44px; compact size
 * exceptions are opt-in for dense controls with a larger adjacent hit region.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-transparent text-sm font-semibold transition-colors outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:outline-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80",
        outline: "border-border-strong bg-surface text-foreground hover:bg-surface-hover aria-expanded:bg-surface-hover",
        secondary: "border-border bg-secondary text-secondary-foreground hover:bg-surface-hover aria-expanded:bg-surface-hover",
        ghost: "bg-transparent text-text-secondary hover:bg-surface-hover hover:text-foreground aria-expanded:bg-surface-hover",
        destructive: "border-danger/30 bg-danger-surface text-danger hover:bg-danger/20 focus-visible:outline-danger",
        link: "bg-transparent text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-11 px-4",
        xs: "min-h-8 gap-1 rounded-md px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "min-h-10 gap-1.5 px-3 text-[13px] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "min-h-12 px-5",
        icon: "size-11",
        "icon-xs": "size-8 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-10 rounded-lg",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
