import { betterAuth } from "better-auth"
import { emailOTP } from "better-auth/plugins"

const isProduction = (env: Env) => env.NEXTJS_ENV === "production"

export function createAuth(env: Env) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    emailAndPassword: {
      enabled: !isProduction(env),
      requireEmailVerification: false,
    },
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
      },
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    plugins: isProduction(env)
      ? [
          emailOTP({
            async sendVerificationOTP({ email, otp, type }) {
              // TODO: Wire up your email provider (Resend, SES, SMTP, etc.)
              console.log(`[OTP] type=${type} email=${email} otp=${otp}`)
            },
          }),
        ]
      : [],
  })
}
