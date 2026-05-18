import { useState, useEffect, type FormEvent } from "react"
import { useNavigate, Link } from "react-router-dom"
import { useAuthStore } from "../stores/authStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ArrowRight, Loader2, Check, X, Eye, EyeOff } from "lucide-react"
import { MissionControlPanel } from "@/components/MissionControlPanel"

export function RegisterPage() {
  const { register, loading, error } = useAuthStore()
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPwd, setShowPwd] = useState(false)
  const [clientError, setClientError] = useState<string | null>(null)

  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(t)
  }, [])

  // Live validation
  const emailLooksValid = /^\S+@\S+\.\S+$/.test(email)
  const pwdLongEnough = password.length >= 6
  const pwdsMatch = confirmPassword.length > 0 && confirmPassword === password
  const canSubmit =
    name.trim().length > 1 && emailLooksValid && pwdLongEnough && pwdsMatch && !loading

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setClientError(null)

    if (password !== confirmPassword) {
      setClientError("Les mots de passe ne correspondent pas.")
      return
    }
    if (password.length < 6) {
      setClientError("Le mot de passe doit contenir au moins 6 caractères.")
      return
    }

    try {
      await register(email, password, name)
      navigate("/")
    } catch {
      /* error in store */
    }
  }

  const displayError = clientError ?? error

  return (
    <div className="relative min-h-svh bg-background bg-grid overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(245,165,36,0.12),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-grain opacity-60" />

      <div className="relative grid min-h-svh lg:grid-cols-[minmax(0,520px)_1fr]">
        {/* ============ LEFT : form ============ */}
        <section className="relative flex flex-col justify-between p-8 lg:p-12">
          <header
            className={`flex items-start justify-between ${mounted ? "boot-in" : ""}`}
            style={{ animationDelay: "80ms" }}
          >
            <Logo />
            <div className="flex items-center gap-2 rounded-sm border border-primary/30 bg-primary/10 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-widest">
              <span className="size-1.5 rounded-full bg-primary status-pulse text-primary" />
              <span className="text-primary">Nouveau compte</span>
            </div>
          </header>

          <main className="flex flex-col gap-7 py-10 lg:py-0">
            <div className={mounted ? "boot-in" : ""} style={{ animationDelay: "200ms" }}>
              <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-primary mb-2">
                · Inscription
              </p>
              <h1 className="text-3xl lg:text-[2.25rem] font-light leading-[1.1] tracking-tight">
                Créer un{" "}
                <span className="font-mono text-primary">compte opérateur</span>
                <span className="cursor-blink ml-1" aria-hidden />
              </h1>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                Vous pourrez ensuite piloter le robot Roblaude, planifier des missions
                et consulter l'historique.{" "}
                <span className="text-foreground/80">
                  Tous les champs sont obligatoires.
                </span>
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className={`flex flex-col gap-5 ${mounted ? "boot-in" : ""}`}
              style={{ animationDelay: "320ms" }}
              noValidate
            >
              {displayError && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
                >
                  <X className="size-4 shrink-0" />
                  <span>{displayError}</span>
                </div>
              )}

              <FieldRow number="01" label="Nom complet" htmlFor="name">
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  autoFocus
                  placeholder="Prénom Nom"
                  className="h-11 bg-card border-border text-[15px] focus-visible:ring-primary/40 focus-visible:border-primary/60"
                />
              </FieldRow>

              <FieldRow
                number="02"
                label="Adresse email"
                htmlFor="email"
                valid={email.length > 0 ? emailLooksValid : undefined}
              >
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="vous@exemple.fr"
                  className="h-11 bg-card border-border font-mono text-[15px] focus-visible:ring-primary/40 focus-visible:border-primary/60"
                />
              </FieldRow>

              <FieldRow
                number="03"
                label="Mot de passe"
                htmlFor="password"
                valid={password.length > 0 ? pwdLongEnough : undefined}
              >
                <div className="relative">
                  <Input
                    id="password"
                    type={showPwd ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="6 caractères minimum"
                    className="h-11 bg-card border-border font-mono text-[15px] pr-10 focus-visible:ring-primary/40 focus-visible:border-primary/60"
                    aria-describedby="pwd-help"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    aria-label={showPwd ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <div
                  id="pwd-help"
                  className={`mt-1 flex items-center gap-1.5 text-[11px] ${
                    password.length === 0
                      ? "text-muted-foreground/70"
                      : pwdLongEnough
                      ? "text-emerald-400"
                      : "text-primary"
                  }`}
                >
                  {password.length === 0 ? (
                    <span className="inline-block size-1.5 rounded-full bg-muted-foreground/40" />
                  ) : pwdLongEnough ? (
                    <Check className="size-3" />
                  ) : (
                    <X className="size-3" />
                  )}
                  Au moins 6 caractères
                </div>
              </FieldRow>

              <FieldRow
                number="04"
                label="Confirmer le mot de passe"
                htmlFor="confirmPassword"
                valid={confirmPassword.length > 0 ? pwdsMatch : undefined}
              >
                <Input
                  id="confirmPassword"
                  type={showPwd ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  placeholder="Retapez le même mot de passe"
                  className="h-11 bg-card border-border font-mono text-[15px] focus-visible:ring-primary/40 focus-visible:border-primary/60"
                  aria-invalid={
                    confirmPassword.length > 0 && !pwdsMatch ? true : undefined
                  }
                />
                {confirmPassword.length > 0 && (
                  <div
                    className={`mt-1 flex items-center gap-1.5 text-[11px] ${
                      pwdsMatch ? "text-emerald-400" : "text-destructive"
                    }`}
                  >
                    {pwdsMatch ? <Check className="size-3" /> : <X className="size-3" />}
                    {pwdsMatch
                      ? "Les mots de passe correspondent"
                      : "Les mots de passe ne correspondent pas"}
                  </div>
                )}
              </FieldRow>

              <Button
                type="submit"
                disabled={!canSubmit}
                className="mt-2 h-12 justify-between rounded-md bg-primary font-mono text-[13px] uppercase tracking-[0.2em] text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                <span className="flex items-center gap-2">
                  {loading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <span className="inline-block size-1.5 rounded-full bg-primary-foreground" />
                  )}
                  {loading ? "Création…" : "Créer mon compte"}
                </span>
                <ArrowRight className="size-4" />
              </Button>
            </form>
          </main>

          <footer
            className={`flex items-center justify-between text-xs ${mounted ? "boot-in" : ""}`}
            style={{ animationDelay: "460ms" }}
          >
            <p className="text-muted-foreground">
              Déjà un compte ?{" "}
              <Link
                to="/login"
                className="text-primary underline-offset-4 hover:underline font-medium"
              >
                Se connecter →
              </Link>
            </p>
            <span className="font-mono text-[10px] text-muted-foreground/60 uppercase tracking-widest">
              v1.0 · Roblaude
            </span>
          </footer>
        </section>

        <aside className="relative hidden lg:block border-l border-border overflow-hidden scan-lines">
          <MissionControlPanel />
        </aside>
      </div>
    </div>
  )
}

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

function FieldRow({
  number,
  label,
  htmlFor,
  valid,
  children,
}: {
  number: string
  label: string
  htmlFor: string
  valid?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={htmlFor} className="flex items-center gap-2 text-sm">
          <span className="font-mono text-[10px] text-primary/70">{number}</span>
          <span className="font-medium text-foreground">{label}</span>
        </Label>
        {valid !== undefined && (
          <span
            className={`inline-flex items-center justify-center size-4 rounded-full ${
              valid ? "bg-emerald-500/15 text-emerald-400" : "bg-destructive/15 text-destructive"
            }`}
            aria-hidden
          >
            {valid ? <Check className="size-3" /> : <X className="size-3" />}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}
