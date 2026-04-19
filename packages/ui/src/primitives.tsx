import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

type ClassNameValue =
  | string
  | null
  | undefined
  | false
  | Record<string, boolean>
  | ClassNameValue[];

export function cn(...values: ClassNameValue[]) {
  const classes: string[] = [];

  function collect(value: ClassNameValue) {
    if (!value) {
      return;
    }
    if (typeof value === "string") {
      classes.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    Object.entries(value).forEach(([key, enabled]) => {
      if (enabled) {
        classes.push(key);
      }
    });
  }

  values.forEach(collect);
  return classes.join(" ");
}

const buttonSizeClassMap = {
  sm: "min-h-10 px-3 py-2 text-sm",
  md: "min-h-11 px-4 py-3 text-sm",
  lg: "min-h-12 px-5 py-3.5 text-sm",
} as const;

const buttonVariantClassMap = {
  primary: "border-cinnabar bg-cinnabar text-white hover:border-cinnabarDeep hover:bg-cinnabarDeep focus-visible:ring-cinnabarRing",
  secondary: "border-lineStrong bg-surface text-inkSoft hover:border-cinnabar hover:bg-cinnabarSoft hover:text-ink focus-visible:ring-lineStrong",
  ghost: "border-transparent bg-transparent text-inkSoft hover:bg-surfaceAlt hover:text-ink focus-visible:ring-line",
  danger: "border-danger bg-danger text-white hover:border-cinnabarDeep hover:bg-cinnabarDeep focus-visible:ring-cinnabarRing",
  link: "border-transparent bg-transparent px-0 py-0 text-cinnabar hover:text-cinnabarDeep focus-visible:ring-cinnabarRing",
} as const;

export type ButtonVariant = keyof typeof buttonVariantClassMap;
export type ButtonSize = keyof typeof buttonSizeClassMap;

export function buttonStyles({
  variant = "secondary",
  size = "md",
  fullWidth = false,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
} = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap border font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
    variant === "link" ? "focus-visible:ring-offset-0" : "focus-visible:ring-offset-paper",
    buttonSizeClassMap[size],
    buttonVariantClassMap[variant],
    fullWidth && "w-full",
  );
}

function ButtonSpinner() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="9" className="opacity-25" stroke="currentColor" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" className="opacity-90" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    fullWidth = false,
    loading = false,
    iconLeft,
    iconRight,
    className,
    children,
    disabled,
    type = "button",
    ...props
  },
  ref,
) {
  const buttonDisabled = disabled || loading;
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      disabled={buttonDisabled}
      aria-busy={loading || undefined}
      className={cn(buttonStyles({ variant, size, fullWidth }), className)}
    >
      {loading ? <ButtonSpinner /> : iconLeft}
      <span>{children}</span>
      {!loading ? iconRight : null}
    </button>
  );
});

const surfaceCardToneClassMap = {
  default: "border-line bg-surface",
  subtle: "border-line bg-surfaceAlt",
  warm: "border-line bg-surfaceWarm",
  highlight: "border-warning/40 bg-surfaceHighlight",
  warning: "border-warning/40 bg-surfaceWarning",
  success: "border-success/25 bg-surfaceSuccess",
} as const;

const surfaceCardPaddingClassMap = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6 md:p-8",
} as const;

export type SurfaceCardTone = keyof typeof surfaceCardToneClassMap;
export type SurfaceCardPadding = keyof typeof surfaceCardPaddingClassMap;

export function surfaceCardStyles({
  tone = "default",
  padding = "none",
  interactive = false,
}: {
  tone?: SurfaceCardTone;
  padding?: SurfaceCardPadding;
  interactive?: boolean;
} = {}) {
  return cn(
    "border shadow-ink",
    surfaceCardToneClassMap[tone],
    surfaceCardPaddingClassMap[padding],
    interactive && "transition-colors duration-200 hover:border-cinnabar hover:bg-surfaceHighlight",
  );
}

export type SurfaceCardProps = HTMLAttributes<HTMLDivElement> & {
  tone?: SurfaceCardTone;
  padding?: Exclude<SurfaceCardPadding, "none">;
  interactive?: boolean;
};

export const SurfaceCard = forwardRef<HTMLDivElement, SurfaceCardProps>(function SurfaceCard(
  {
    tone = "default",
    padding = "md",
    interactive = false,
    className,
    ...props
  },
  ref,
) {
  return (
    <div
      {...props}
      ref={ref}
      className={cn(surfaceCardStyles({ tone, padding, interactive }), className)}
    />
  );
});

export type CardTone = SurfaceCardTone;
export type CardPadding = NonNullable<SurfaceCardProps["padding"]>;
export type CardProps = SurfaceCardProps;

export function cardStyles(options: Parameters<typeof surfaceCardStyles>[0] = {}) {
  return surfaceCardStyles(options);
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(props, ref) {
  return <SurfaceCard {...props} ref={ref} />;
});

export const fieldLabelClassName = "block text-sm text-inkSoft";
export const fieldEyebrowClassName = "mb-2 text-xs uppercase tracking-[0.16em] text-inkFaint";
export const fieldHintClassName = "mt-2 text-sm leading-6 text-inkMuted";

export function inputStyles({
  invalid = false,
}: {
  invalid?: boolean;
} = {}) {
  return cn(
    "min-h-11 w-full border bg-surface px-4 py-3 text-sm text-ink transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinnabarRing focus-visible:ring-offset-1 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60",
    invalid ? "border-danger" : "border-lineStrong",
  );
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    invalid = false,
    className,
    ...props
  },
  ref,
) {
  return <input {...props} ref={ref} className={cn(inputStyles({ invalid }), className)} />;
});

export function textareaStyles({
  invalid = false,
}: {
  invalid?: boolean;
} = {}) {
  return cn(
    "min-h-[96px] w-full border bg-surface px-4 py-3 text-sm leading-7 text-ink transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinnabarRing focus-visible:ring-offset-1 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60",
    invalid ? "border-danger" : "border-lineStrong",
  );
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    invalid = false,
    className,
    ...props
  },
  ref,
) {
  return <textarea {...props} ref={ref} className={cn(textareaStyles({ invalid }), className)} />;
});

export function selectStyles({
  invalid = false,
}: {
  invalid?: boolean;
} = {}) {
  return cn(
    "min-h-11 w-full border bg-surface px-4 py-3 text-sm text-ink transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinnabarRing focus-visible:ring-offset-1 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60",
    invalid ? "border-danger" : "border-lineStrong",
  );
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    invalid = false,
    className,
    children,
    ...props
  },
  ref,
) {
  return (
    <select {...props} ref={ref} className={cn(selectStyles({ invalid }), className)}>
      {children}
    </select>
  );
});
