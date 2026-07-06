// Локализация: русский и английский. Язык берётся из ysdk.environment.i18n.lang.

const DICTS = {
  ru: {
    play: 'Играть',
    modeClassic: 'Классика',
    modeSprint: 'Спринт',
    modeRampage: 'Разгром',
    modeSprintDesc: '90 секунд на максимум очков',
    modeRampageDesc: '60 секунд безнаказанного тарана',
    garage: 'Гараж',
    missions: 'Задания',
    leaderboard: 'Рекорды',
    settings: 'Настройки',
    paused: 'Пауза',
    resume: 'Продолжить',
    toMenu: 'В меню',
    crash: 'Авария!',
    timeUp: 'Финиш!',
    score: 'Счёт',
    best: 'Рекорд',
    coinsEarned: 'Монеты',
    newRecord: 'Новый рекорд!',
    revive: 'Продолжить',
    restart: 'Заново',
    doubleCoins: 'x2 монеты',
    select: 'Выбрать',
    selected: 'Выбрано',
    owned: 'Куплено',
    freeCoins: '+250 монет',
    nearMiss: 'На волоске!',
    oncomingMiss: 'Безумец!',
    ram: 'ТАРАН!',
    shield: 'Щит',
    magnet: 'Магнит',
    x2: 'x2 очки',
    nitroReady: 'Нитро готово!',
    ufo: 'НЛО?! +100',
    konami: 'ЧИТ-КОД! +500',
    dailyBonus: 'Бонус дня {n}: +{r}',
    missionDone: 'Задание выполнено! +{r}',
    lbUnavailable: 'Войдите в Яндекс, чтобы попасть в таблицу рекордов',
    lbEmpty: 'Пока пусто — стань первым!',
    you: 'Ты',
    sndSound: 'Звуки',
    sndMusic: 'Музыка',
    sndVibro: 'Вибрация',
    sndQuality: 'Графика',
    qAuto: 'Авто',
    qLow: 'Эконом',
    hintDesktop: '← → — руль · W — нитро · G — гудок',
    hintMobile: 'Свайпы — руль · кнопки — нитро и гудок',
    sprintTimer: 'Время',
    crashPhrases: [
      'Кто так ездит?!',
      'Страховка это не покроет…',
      'ДПС уже выехали',
      'Бампер остался где-то там',
      'Это была не твоя полоса',
      'Навигатор говорил повернуть',
      'Машины не бесплатные вообще-то',
      'Красиво летел',
    ],
    buyJokes: {
      'garbage-truck': 'Мощь помойки! 🗑',
      taxi: 'Шеф, свободен? 🟢',
      ambulance: 'Сам себя откачаешь 🚑',
      firetruck: 'Горишь? Уже нет 🔥',
      police: 'Теперь ты и есть погоня 🚨',
      'race-future': 'Из 3026 года 🛸',
    },
    carNames: {
      'sedan-sports': 'Спорт-седан', race: 'Болид', 'race-future': 'Гипер-кар',
      taxi: 'Такси', police: 'Полиция', ambulance: 'Скорая',
      firetruck: 'Пожарная', 'suv-luxury': 'Люкс-джип', van: 'Фургон',
      'garbage-truck': 'Мусоровоз', 'hatchback-sports': 'Хот-хэтч', suv: 'Джип',
    },
    missionTexts: {
      coins_run: 'Собери {n} монет за один заезд',
      dist_run: 'Проедь {n} м за один заезд',
      near_run: '«На волоске» {n} раз за заезд',
      overtake_run: 'Обгони {n} машин за заезд',
      cones_total: 'Сбей {n} конусов',
      nitro_total: 'Используй нитро {n} раз',
      ram_total: 'Протарань {n} машин',
      time_run: 'Продержись {n} секунд',
    },
  },
  en: {
    play: 'Play',
    modeClassic: 'Classic',
    modeSprint: 'Sprint',
    modeRampage: 'Rampage',
    modeSprintDesc: '90 seconds for max score',
    modeRampageDesc: '60 seconds of guilt-free ramming',
    garage: 'Garage',
    missions: 'Missions',
    leaderboard: 'Top Scores',
    settings: 'Settings',
    paused: 'Paused',
    resume: 'Resume',
    toMenu: 'Menu',
    crash: 'Crashed!',
    timeUp: 'Finish!',
    score: 'Score',
    best: 'Best',
    coinsEarned: 'Coins',
    newRecord: 'New record!',
    revive: 'Continue',
    restart: 'Retry',
    doubleCoins: 'x2 coins',
    select: 'Select',
    selected: 'Selected',
    owned: 'Owned',
    freeCoins: '+250 coins',
    nearMiss: 'Near miss!',
    oncomingMiss: 'Madlad!',
    ram: 'RAMMED!',
    shield: 'Shield',
    magnet: 'Magnet',
    x2: 'x2 score',
    nitroReady: 'Nitro ready!',
    ufo: 'UFO?! +100',
    konami: 'CHEAT CODE! +500',
    dailyBonus: 'Daily bonus, day {n}: +{r}',
    missionDone: 'Mission complete! +{r}',
    lbUnavailable: 'Sign in to Yandex to join the leaderboard',
    lbEmpty: 'Empty so far — be the first!',
    you: 'You',
    sndSound: 'Sounds',
    sndMusic: 'Music',
    sndVibro: 'Vibration',
    sndQuality: 'Graphics',
    qAuto: 'Auto',
    qLow: 'Eco',
    hintDesktop: '← → steer · W nitro · G horn',
    hintMobile: 'Swipe to steer · buttons for nitro & horn',
    sprintTimer: 'Time',
    crashPhrases: [
      'Who drives like that?!',
      'Insurance won\'t cover this…',
      'Cops are on their way',
      'The bumper stayed back there',
      'That was not your lane',
      'GPS said turn left',
      'Cars aren\'t free, you know',
      'Nice flight though',
    ],
    buyJokes: {
      'garbage-truck': 'Power of the dumpster! 🗑',
      taxi: 'Where to, boss? 🟢',
      ambulance: 'Self-rescue enabled 🚑',
      firetruck: 'On fire? Not anymore 🔥',
      police: 'Now YOU are the chase 🚨',
      'race-future': 'Imported from 3026 🛸',
    },
    carNames: {
      'sedan-sports': 'Sport Sedan', race: 'Racer', 'race-future': 'Hyper Car',
      taxi: 'Taxi', police: 'Police', ambulance: 'Ambulance',
      firetruck: 'Fire Truck', 'suv-luxury': 'Lux SUV', van: 'Van',
      'garbage-truck': 'Garbage Truck', 'hatchback-sports': 'Hot Hatch', suv: 'SUV',
    },
    missionTexts: {
      coins_run: 'Collect {n} coins in one run',
      dist_run: 'Drive {n} m in one run',
      near_run: 'Get {n} near-misses in one run',
      overtake_run: 'Overtake {n} cars in one run',
      cones_total: 'Knock down {n} cones',
      nitro_total: 'Use nitro {n} times',
      ram_total: 'Ram {n} cars',
      time_run: 'Survive {n} seconds',
    },
  },
};

let dict = DICTS.en;
let langCode = 'en';

export function setLanguage(lang) {
  langCode = ['en'].includes(lang) ? 'en' : (['ru', 'be', 'kk', 'uk', 'uz', 'az', 'hy', 'ka', 'ky', 'tg', 'tk', 'mo'].includes(lang) ? 'ru' : 'en');
  dict = DICTS[langCode];
  document.documentElement.lang = langCode;
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
}

export function t(key, params) {
  let s = dict[key] ?? DICTS.en[key] ?? key;
  if (typeof s === 'string' && params) {
    for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, v);
  }
  return s;
}

export function missionText(type, n) {
  const s = dict.missionTexts[type] ?? DICTS.en.missionTexts[type] ?? type;
  return s.replace('{n}', n);
}

export function carName(id) {
  return dict.carNames[id] ?? DICTS.en.carNames[id] ?? id;
}

export function crashPhrase() {
  const arr = dict.crashPhrases;
  return arr[Math.floor(Math.random() * arr.length)];
}

export function buyJoke(id) {
  return dict.buyJokes[id] ?? null;
}

export function currentLang() {
  return langCode;
}
