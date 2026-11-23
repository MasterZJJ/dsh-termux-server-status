#!/usr/bin/env node
/**
 * 安装 dsh-termux-state 到当前 DSH profile。
 *
 *   node scripts/install.mjs [--profile web] [--home ~/.dsh-v021] [--dry-run]
 *
 * 做三件事：
 *  1. 把插件文件复制到 <home>/profiles/<profile>/node_modules/dsh-termux-state
 *  2. 在 profile 的 package.json 里登记依赖与 bundles 条目（幂等）
 *  3. 打印重启提示 —— bundle 只在宿主启动时装载
 */

import { cp, mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(here, '..')
const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}
const dryRun = argv.includes('--dry-run')

const home = flag('home', process.env.DSH_HOME || join(homedir(), '.dsh-v021'))
const profile = flag('profile', 'web')
const profileDir = join(home, 'profiles', profile)
const target = join(profileDir, 'node_modules', 'dsh-termux-state')

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

if (!(await exists(profileDir))) {
  console.error(`找不到 profile: ${profileDir}`)
  process.exit(1)
}

console.log(`插件源: ${pkgRoot}`)
console.log(`安装到: ${target}`)

if (dryRun) {
  console.log('[dry-run] 不写入任何文件')
  process.exit(0)
}

await mkdir(target, { recursive: true })
for (const item of ['lib', 'cordis.patch.yml', 'package.json', 'README.md']) {
  const src = join(pkgRoot, item)
  if (await exists(src)) {
    await cp(src, join(target, item), { recursive: true })
  }
}

const pkgPath = join(profileDir, 'package.json')
const profilePkg = JSON.parse(await readFile(pkgPath, 'utf8'))
profilePkg.dependencies = profilePkg.dependencies || {}
profilePkg.dependencies['dsh-termux-state'] = `file:${pkgRoot}`
profilePkg.dsh = profilePkg.dsh || {}
profilePkg.dsh.profile = profilePkg.dsh.profile || {}
const bundles = profilePkg.dsh.profile.bundles || []
if (!bundles.includes('dsh-termux-state')) bundles.push('dsh-termux-state')
profilePkg.dsh.profile.bundles = bundles
await writeFile(pkgPath, `${JSON.stringify(profilePkg, null, 2)}\n`, 'utf8')

console.log('\n已写入:')
console.log(`  ${target}`)
console.log(`  ${pkgPath}  (bundles: ${bundles.join(', ')})`)
console.log('\n重启宿主后生效：')
console.log('  dsh web --no-open --port 3080')
