/**
 * 微信推送（复用 DSH-IM 的微信机器人凭据）。
 *
 * 与 workspace 里的 wechat_push.py 同一套协议：
 *   POST https://ilinkai.weixin.qq.com/ilink/bot/sendmessage
 * 凭据从 <DSH_HOME>/integrations/dsh-weixin 与 .credentials.yaml 实时读取。
 */

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const PROTOCOL_VERSION = '2.4.6'
const APP_ID = 'bot'
const CLIENT_VERSION = String((2 << 16) | (4 << 8) | 6)
const TIMEOUT_MS = 15000

function candidateHomes() {
  const homes = []
  if (process.env.DSH_HOME) homes.push(process.env.DSH_HOME)
  homes.push(join(homedir(), '.dsh-v021'), join(homedir(), '.dsh'))
  return homes
}

function parseRefs(text) {
  const refs = {}
  let inRefs = false
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    if (line.trim() === 'refs:') {
      inRefs = true
      continue
    }
    if (inRefs) {
      if (!line.startsWith(' ') && !line.startsWith('\t')) break
      const i = line.indexOf(':')
      if (i > 0) refs[line.slice(0, i).trim()] = line.slice(i + 1).trim()
    }
  }
  return refs
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

/** 找到带微信机器人的 DSH home。 */
export async function resolveWeixinAccount() {
  for (const home of candidateHomes()) {
    const cfg = await readJson(join(home, 'integrations', 'dsh-weixin', 'config.json'))
    const account = cfg?.accounts?.[0]
    if (!account) continue
    const credText = await readFile(join(home, '.credentials.yaml'), 'utf8').catch(() => '')
    const token = (account.tokenRef && process.env[account.tokenRef]) || parseRefs(credText)[account.tokenRef] || ''
    if (!token) continue
    const st = await readJson(join(home, 'integrations', 'dsh-weixin', 'accounts', account.botId, 'state.json'))
    const ctxToken = st?.contextTokens?.users?.[account.ownerUserId]?.token || ''
    return {
      botId: account.botId,
      toUserId: account.ownerUserId,
      token,
      contextToken: ctxToken,
      baseUrl: account.baseUrl || 'https://ilinkai.weixin.qq.com/',
    }
  }
  return null
}

export async function sendWechat(text, { withContext = true } = {}) {
  const acc = await resolveWeixinAccount()
  if (!acc) return { ok: false, error: '没有找到已接入的微信机器人' }

  const url = `${acc.baseUrl.replace(/\/+$/, '')}/ilink/bot/sendmessage`
  const clientId = `dsh-termux-state-${Math.random().toString(16).slice(2, 14)}`
  const msg = {
    from_user_id: '',
    to_user_id: acc.toUserId,
    client_id: clientId,
    message_type: 2,
    message_state: 2,
    item_list: [{ type: 1, text_item: { text } }],
  }
  if (withContext && acc.contextToken) msg.context_token = acc.contextToken
  const body = {
    msg,
    base_info: { channel_version: PROTOCOL_VERSION, bot_agent: 'DeepSeekHarness/1.1.0' },
  }

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'iLink-App-Id': APP_ID,
        'iLink-App-ClientVersion': CLIENT_VERSION,
        AuthorizationType: 'ilink_bot_token',
        'X-WECHAT-UIN': Buffer.from(String(Math.floor(Math.random() * 2 ** 32))).toString('base64'),
        Authorization: `Bearer ${acc.token}`,
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    })
    const text2 = await res.text()
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${text2.slice(0, 200)}` }
    let messageId = null
    try {
      messageId = JSON.parse(text2).message_id ?? null
    } catch {}
    return { ok: true, messageId }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  } finally {
    clearTimeout(timer)
  }
}
