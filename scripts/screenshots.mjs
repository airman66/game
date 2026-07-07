// Магазинные скриншоты через Playwright → publish/screenshots/<lang>/*.png (1080×1920).
// Использует УЖЕ ЗАПУЩЕННЫЙ dev-сервер (:5173). Язык через SHOT_LANG=ru|en (по умолч. оба).
//   node scripts/screenshots.mjs            → ru и en
//   SHOT_LANG=en node scripts/screenshots.mjs
// Игра открывается с ?debug — main.js публикует window.__ttd для управления сценами.
import { chromium } from 'playwright'
import { homedir } from 'node:os'
import { existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.URL || 'http://localhost:5173/'
const LANGS = process.env.SHOT_LANG ? [process.env.SHOT_LANG] : ['ru', 'en']

const CACHE = join(homedir(), 'Library/Caches/ms-playwright')
const CANDIDATES = [
  join(CACHE, 'chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
  join(CACHE, 'chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
]
const executablePath = CANDIDATES.find((p) => existsSync(p))

const browser = await chromium.launch({
  executablePath,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'],
})

for (const lang of LANGS) {
  const OUT = join(ROOT, 'publish/screenshots', lang)
  mkdirSync(OUT, { recursive: true })
  const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 })
  await page.goto(`${BASE}?lang=${lang}&debug=1`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__ttd, { timeout: 30000 })
  await page.waitForTimeout(1500)

  const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`) })
  const toMenu = async () => { await page.evaluate(() => window.__ttd.goMenu(false)); await page.waitForTimeout(700) }

  // 0) меню с логотипом
  await page.evaluate(() => document.getElementById('tutorial-hint').classList.remove('show'))
  await shot('00_menu')

  // 1) классика днём: неуязвимость на время скрина, накат ~6с — трафик, счёт, скорость
  await page.evaluate(() => {
    const { game, startRun } = window.__ttd
    startRun('classic')
    game.state.cfg = { ...game.state.cfg, invuln: true } // не разбиться, пока ждём кадр
    game.world._setTod(0.78) // день
    document.getElementById('tutorial-hint').classList.remove('show')
  })
  await page.waitForTimeout(6000)
  await page.evaluate(() => window.__ttd.game.world._setTod(0.8))
  await shot('01_race')

  // 2) нитро на закате: полная шкала → активация → пламя и виньетка
  await page.evaluate(() => {
    const { game } = window.__ttd
    game.world._setTod(0.97) // закат
    game.state.nitro = 100
    game.nitro()
  })
  await page.waitForTimeout(900)
  await shot('02_nitro')

  // 3) разгром ночью: тараны с фейерверком частиц (рулим в трафик)
  await page.evaluate(() => {
    window.__ttd.startRun('rampage')
    window.__ttd.game.world._setTod(0.25) // ночь, звёзды, фары
  })
  await page.waitForTimeout(3500)
  for (let i = 0; i < 9; i++) {
    await page.evaluate((dir) => window.__ttd.game.steer(dir), i % 2 ? 1 : -1)
    await page.waitForTimeout(550)
  }
  await shot('03_rampage')

  // 4) гараж
  await toMenu()
  await page.click('#btn-garage')
  await page.waitForTimeout(900)
  await shot('04_garage')
  await page.click('#btn-garage-back')

  // 5) задания
  await page.waitForTimeout(400)
  await page.click('#btn-missions')
  await page.waitForTimeout(600)
  await shot('05_missions')
  await page.click('#btn-missions-back')

  // 6) экран результата: новый рекорд, конфетти, кнопка продолжения
  await page.waitForTimeout(400)
  await page.evaluate(() => {
    window.__ttd.gameOver({
      score: 12480, coins: 57, canRevive: true, reason: 'crash',
      stats: { dist: 4200, coins: 57, near: 11, overtakes: 34, cones: 5, nitroUses: 3, rams: 0, time: 96 },
    })
  })
  await page.waitForTimeout(900)
  await shot('06_gameover')

  await page.close()
  console.log(`✓ ${lang}: скриншоты в publish/screenshots/${lang}/ (1080×1920)`)
}

await browser.close()
