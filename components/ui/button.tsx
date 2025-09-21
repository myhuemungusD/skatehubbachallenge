import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-full px-6 py-3 text-base font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-r from-hubba-orange to-hubba-green text-black shadow-glow hover:opacity-90",
        outline:
          "border border-white/20 bg-transparent text-white hover:border-hubba-green hover:text-hubba-green",
        ghost: "bg-white/5 text-white hover:bg-white/10",
        destructive: "bg-red-600 text-white hover:bg-red-700"
      },
      size: {
        default: "h-11",
        sm: "h-9 px-4 text-sm",
        lg: "h-14 text-lg",
        icon: "h-10 w-10"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
  const { className, variant, size, asChild = false, ...rest } = props;
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...rest} />
  );
});
Button.displayName = "Button";

export { Button, buttonVariants };
