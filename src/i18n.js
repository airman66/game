// Локализация: ru — для СНГ, en — по умолчанию для остальных, tr — Турция.
// Язык берётся из ysdk.environment.i18n.lang (требование Яндекс Игр).

const DICTS = {
  ru: {
    play: 'Играть',
    garage: 'Гараж',
    paused: 'Пауза',
    resume: 'Продолжить',
    toMenu: 'В меню',
    crash: 'Авария!',
    score: 'Счёт',
    best: 'Рекорд',
    coinsEarned: 'Монеты',
    newRecord: 'Новый рекорд!',
    revive: 'Продолжить',
    restart: 'Заново',
    select: 'Выбрать',
    selected: 'Выбрано',
    owned: 'Куплено',
    nearMiss: 'На волоске!',
    shield: 'Щит',
    magnet: 'Магнит',
    x2: 'x2 очки',
    hintDesktop: 'Управление: ← → или A / D',
    hintMobile: 'Свайпай влево и вправо, уворачивайся от машин!',
    carNames: {
      'sedan-sports': 'Спорт-седан', race: 'Болид', 'race-future': 'Гипер-кар',
      taxi: 'Такси', police: 'Полиция', ambulance: 'Скорая',
      firetruck: 'Пожарная', 'suv-luxury': 'Люкс-джип', van: 'Фургон',
      'garbage-truck': 'Мусоровоз', 'hatchback-sports': 'Хот-хэтч', suv: 'Джип',
    },
  },
  en: {
    play: 'Play',
    garage: 'Garage',
    paused: 'Paused',
    resume: 'Resume',
    toMenu: 'Menu',
    crash: 'Crashed!',
    score: 'Score',
    best: 'Best',
    coinsEarned: 'Coins',
    newRecord: 'New record!',
    revive: 'Continue',
    restart: 'Retry',
    select: 'Select',
    selected: 'Selected',
    owned: 'Owned',
    nearMiss: 'Near miss!',
    shield: 'Shield',
    magnet: 'Magnet',
    x2: 'x2 score',
    hintDesktop: 'Controls: ← → or A / D',
    hintMobile: 'Swipe left and right to dodge traffic!',
    carNames: {
      'sedan-sports': 'Sport Sedan', race: 'Racer', 'race-future': 'Hyper Car',
      taxi: 'Taxi', police: 'Police', ambulance: 'Ambulance',
      firetruck: 'Fire Truck', 'suv-luxury': 'Lux SUV', van: 'Van',
      'garbage-truck': 'Garbage Truck', 'hatchback-sports': 'Hot Hatch', suv: 'SUV',
    },
  },
  tr: {
    play: 'Oyna',
    garage: 'Garaj',
    paused: 'Durduruldu',
    resume: 'Devam et',
    toMenu: 'Menü',
    crash: 'Kaza!',
    score: 'Skor',
    best: 'Rekor',
    coinsEarned: 'Altın',
    newRecord: 'Yeni rekor!',
    revive: 'Devam et',
    restart: 'Tekrar',
    select: 'Seç',
    selected: 'Seçildi',
    owned: 'Alındı',
    nearMiss: 'Kıl payı!',
    shield: 'Kalkan',
    magnet: 'Mıknatıs',
    x2: 'x2 puan',
    hintDesktop: 'Kontroller: ← → veya A / D',
    hintMobile: 'Trafikten kaçmak için sağa sola kaydır!',
    carNames: {
      'sedan-sports': 'Spor Sedan', race: 'Yarış Arabası', 'race-future': 'Hiper Araba',
      taxi: 'Taksi', police: 'Polis', ambulance: 'Ambulans',
      firetruck: 'İtfaiye', 'suv-luxury': 'Lüks SUV', van: 'Minibüs',
      'garbage-truck': 'Çöp Kamyonu', 'hatchback-sports': 'Sıcak Hatch', suv: 'SUV',
    },
  },
};

let dict = DICTS.en;
let langCode = 'en';

export function setLanguage(lang) {
  langCode = ['ru', 'be', 'kk', 'uk', 'uz'].includes(lang) ? 'ru' : (DICTS[lang] ? lang : 'en');
  dict = DICTS[langCode];
  document.documentElement.lang = langCode;
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
}

export function t(key) {
  return dict[key] ?? DICTS.en[key] ?? key;
}

export function carName(id) {
  return dict.carNames[id] ?? DICTS.en.carNames[id] ?? id;
}

export function currentLang() {
  return langCode;
}
