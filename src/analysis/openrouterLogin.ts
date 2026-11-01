import { getSettings, saveSettings } from '../db'

const VERIFIER_KEY = 'openrouter-pkce-verifier'

const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

export async function codeChallenge(verifier: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64Url(new Uint8Array(digest))
}

export async function loginUrl(callbackUrl: string, verifier: string) {
  const params = new URLSearchParams({
    callback_url: callbackUrl,
    code_challenge: await codeChallenge(verifier),
    code_challenge_method: 'S256',
  })
  return `https://openrouter.ai/auth?${params}`
}

// 利用者が OpenRouter で承認すると、ログインした人のキーが発行される。キーを手で貼らずに済む
export async function startOpenRouterLogin() {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)))
  sessionStorage.setItem(VERIFIER_KEY, verifier)
  location.href = await loginUrl(`${location.origin}${location.pathname}`, verifier)
}

// 自分で始めたログインの戻りだけを受け付ける。verifier がないのに code が付いていても無視する
export async function finishOpenRouterLogin(search: string, storage: Pick<Storage, 'getItem' | 'removeItem'>) {
  const code = new URLSearchParams(search).get('code')
  const verifier = storage.getItem(VERIFIER_KEY)
  if (!code || !verifier) return null
  storage.removeItem(VERIFIER_KEY)
  try {
    const res = await fetch('https://openrouter.ai/api/v1/auth/keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
    })
    const { key } = res.ok ? await res.json() : { key: undefined }
    if (!key) return 'failed'
    const { keys } = await getSettings()
    await saveSettings({ provider: 'openrouter', keys: { ...keys, openrouter: key } })
    return 'ok'
  } catch {
    return 'failed'
  }
}
