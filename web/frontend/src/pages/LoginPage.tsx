import { useState, useEffect, type FormEvent } from "react"
import { useNavigate, Link } from "react-router-dom"
import { useAuthStore } from "../stores/authStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ArrowRight, Loader2 } from "lucide-react"
import { MissionControlPanel } from "@/components/MissionControlPanel"

export function LoginPage() {
  const { login, loading, error } = useAuthStore()
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({})

  // Boot mounted
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(t)
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      await login(email, password)
      navigate("/")
    } catch {
      /* error handled in store */
    }
  }

  return (
    <div className="relative min-h-svh bg-background bg-grid overflow-hidden">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(245,165,36,0.12),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-grain opacity-60" />

      <div className="relative grid min-h-svh lg:grid-cols-[minmax(0,480px)_1fr]">
        {/* ============ LEFT : Auth form ============ */}
        <section className="relative flex flex-col justify-between p-8 lg:p-12">
          {/* Brand */}
          <header
            className={`flex items-start justify-between ${mounted ? "boot-in" : ""}`}
            style={{ animationDelay: "80ms" }}
          >
            <div>
              <Logo />
              <p className="mt-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-mono">
                Assistant Robotique · ERP
              </p>
            </div>
            <SystemBadge />
          </header>

          {/* Form */}
          <main className="flex flex-col gap-8 py-12 lg:py-0">
            <div
              className={mounted ? "boot-in" : ""}
              style={{ animationDelay: "200ms" }}
            >
              <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-primary mb-2">
                · Authentification requise
              </p>
              <h1 className="text-3xl lg:text-[2.5rem] font-light leading-[1.05] tracking-tight">
                Accédez au
                <br />
                <span className="font-mono text-primary">poste de contrôle</span>
                <span className="cursor-blink ml-1" aria-hidden />
              </h1>
            </div>

            <form
              onSubmit={handleSubmit}
              className={`flex flex-col gap-5 ${mounted ? "boot-in" : ""}`}
              style={{ animationDelay: "320ms" }}
              noValidate
            >
              {error && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
                >
                  <span className="inline-block size-1.5 rounded-full bg-destructive" />
                  <span>{error}</span>
                </div>
              )}

              <FieldRow
                number="01"
                label="Identifiant"
                hint="email.fr"
                htmlFor="email"
              >
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                  required
                  autoComplete="email"
                  autoFocus
                  placeholder="operateur@roblaude.fr"
                  className="h-11 bg-card border-border font-mono text-[15px] focus-visible:ring-primary/40 focus-visible:border-primary/60"
                  aria-invalid={touched.email && !email ? true : undefined}
                />
              </FieldRow>

              <FieldRow
                number="02"
                label="Clé d'accès"
                hint="min. 6 caractères"
                htmlFor="password"
              >
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                  required
                  minLength={6}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="h-11 bg-card border-border font-mono text-[15px] focus-visible:ring-primary/40 focus-visible:border-primary/60"
                />
              </FieldRow>

              <Button
                type="submit"
                disabled={loading}
                className="mt-2 h-12 justify-between rounded-md bg-primary font-mono text-[13px] uppercase tracking-[0.2em] text-primary-foreground hover:bg-primary/90"
              >
                <span className="flex items-center gap-2">
                  {loading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <span className="inline-block size-1.5 rounded-full bg-primary-foreground" />
                  )}
                  {loading ? "Connexion en cours…" : "Autoriser l'accès"}
                </span>
                <ArrowRight className="size-4" />
              </Button>
            </form>
          </main>

          {/* Footer link */}
          <footer
            className={`flex items-center justify-between text-xs ${mounted ? "boot-in" : ""}`}
            style={{ animationDelay: "460ms" }}
          >
            <p className="text-muted-foreground">
              Nouvel opérateur ?{" "}
              <Link
                to="/register"
                className="text-primary underline-offset-4 hover:underline font-medium"
              >
                Demander un accès →
              </Link>
            </p>
            <span className="font-mono text-[10px] text-muted-foreground/60 uppercase tracking-widest">
              v1.0 · Roblaude
            </span>
          </footer>
        </section>

        {/* ============ RIGHT : Mission Control panel ============ */}
        <aside className="relative hidden lg:block border-l border-border overflow-hidden scan-lines">
          <MissionControlPanel />
        </aside>
      </div>
    </div>
  )
}

/* ============================================================
   Sub-components
   ============================================================ */

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative size-8 rounded-sm border border-primary/40 bg-primary/10 flex items-center justify-center">
        <span className="font-mono text-primary text-[15px] font-bold leading-none">R</span>
        <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary animate-pulse" />
      </div>
      <div className="flex flex-col leading-none">
        <span className="font-mono text-[15px] font-semibold tracking-tight text-foreground">
          ROBLAUDE
        </span>
        <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
          Control // Terminal
        </span>
      </div>
    </div>
  )
}

function SystemBadge() {
  return (
    <div className="flex items-center gap-2 rounded-sm border border-border bg-card/60 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-widest">
      <span className="size-1.5 rounded-full bg-emerald-500 status-pulse text-emerald-500" />
      <span className="text-muted-foreground">Système</span>
      <span className="text-emerald-400">Opérationnel</span>
    </div>
  )
}

function FieldRow({
  number,
  label,
  hint,
  htmlFor,
  children,
}: {
  number: string
  label: string
  hint?: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={htmlFor} className="flex items-center gap-2 text-sm">
          <span className="font-mono text-[10px] text-primary/70">{number}</span>
          <span className="font-medium text-foreground">{label}</span>
        </Label>
        {hint && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}
