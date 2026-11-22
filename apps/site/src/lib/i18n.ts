// UI strings of the site chrome (menus, buttons, headings of generated blocks), taken from the
// legacy templates. Names of hubs and categories come from frontmatter `label`.
import type { Lang } from '@slobodskyi/core';

export const HTML_LANG: Record<Lang, string> = { en: 'en', uk: 'uk', ru: 'ru' };
export const OG_LOCALE: Record<Lang, string> = { en: 'en_US', uk: 'uk_UA', ru: 'ru_RU' };
export const LANG_NAME: Record<Lang, string> = { en: 'English', uk: 'Українська', ru: 'Русский' };
export const LANG_SHORT: Record<Lang, string> = { en: 'EN', uk: 'UA', ru: 'RU' };

const ui = {
  en: {
    tools: 'Tools',
    courses: 'Courses',
    guides: 'Guides',
    language: 'Language',
    menu: 'Menu',
    home: 'Home',
    about: 'About',
    contacts: 'Contacts',
    affiliate: 'Affiliate Disclosure',
    toc: 'Table of Contents',
    related: 'Related Articles',
    faq: 'Frequently Asked Questions',
    minutes: (n: number) => `${n} minutes`,
    articles: (n: number) => `${n} ${n === 1 ? 'Article' : 'Articles'}`,
    updated: 'Updated',
    share: 'Share',
    copyLink: 'Copy link',
    author: 'Author',
    authorName: 'Oleksandr Slobodskyi',
    authorBio:
      'For over a decade I have been testing how creators actually earn: platforms, payments, tools, systems.',
    patreonText:
      'On Patreon, I share my experiments, insights, and behind-the-scenes progress as I rebuild and grow. I explore fresh ideas across different media and languages, dive into AI tools, and pass along every lesson I learn.',
    patreonButton: 'Subscribe for Free →',
    disclaimer:
      'I recommend products and services I personally use and enjoy. If you make a purchase through the links on this site, I may earn a commission.',
    disclaimerLink: 'How it works?',
    notFoundTitle: 'Page not found',
    notFoundText: 'The page you are looking for does not exist or has been moved.',
    notFoundBack: 'Go to the home page',
    playVideo: 'Play video',
    loadEmbed: 'Load',
  },
  uk: {
    tools: 'Інструменти',
    courses: 'Курси',
    guides: 'Гайди',
    language: 'Мова',
    menu: 'Меню',
    home: 'Головна',
    about: 'Про автора',
    contacts: 'Контакти',
    affiliate: 'Партнерська інформація',
    toc: 'Зміст статті',
    related: "Пов'язані статті",
    faq: 'Часті питання',
    minutes: (n: number) => `${n} хв`,
    articles: (n: number) => `Статей: ${n}`,
    updated: 'Оновлено',
    share: 'Поділитися',
    copyLink: 'Скопіювати посилання',
    author: 'Автор',
    authorName: 'Олександр Слободський',
    authorBio:
      'Понад десять років я перевіряю, як кріейтори насправді заробляють: платформи, платежі, інструменти, системи.',
    patreonText:
      'На Patreon я розповідаю про свої експерименти, ідеї та закулісні процеси. Досліджую нові підходи в різних медіа та мовах, занурююся в AI-інструменти й ділюся корисними порадами та знахідками (контент англійською).',
    patreonButton: '7 днів безкоштовно →',
    disclaimer:
      'Я рекомендую лише ті продукти, якими користуюсь особисто і в якості яких я впевнений. Якщо ви зареєструєтеся за посиланнями зі статей, я можу отримати комісію.',
    disclaimerLink: 'Як це працює?',
    notFoundTitle: 'Сторінку не знайдено',
    notFoundText: 'Сторінка, яку ви шукаєте, не існує або була переміщена.',
    notFoundBack: 'На головну',
    playVideo: 'Відтворити відео',
    loadEmbed: 'Завантажити',
  },
  ru: {
    tools: 'Инструменты',
    courses: 'Курсы',
    guides: 'Гайды',
    language: 'Язык',
    menu: 'Меню',
    home: 'Главная',
    about: 'Про автора',
    contacts: 'Контакты',
    affiliate: 'Партнерская информация',
    toc: 'Список тем',
    related: 'Статьи по теме',
    faq: 'Популярные вопросы',
    minutes: (n: number) => `${n} мин`,
    articles: (n: number) => `Статей: ${n}`,
    updated: 'Обновлено',
    share: 'Поделиться',
    copyLink: 'Скопировать ссылку',
    author: 'Автор',
    authorName: 'Александр Слободской',
    authorBio:
      'Больше десяти лет я проверяю, как криейторы на самом деле зарабатывают: платформы, платежи, инструменты, системы.',
    patreonText:
      'На Patreon я рассказываю о своих экспериментах, идеях и закулисных процессах. Исследую новые подходы в разных медиа и языках, активно работаю с AI-инструментами и делюсь полезными советами и находками (контент на английском).',
    patreonButton: '7 дней бесплатно →',
    disclaimer:
      'Я рекомендую только те продукты, которыми пользуюсь лично и в качестве которых я уверен. Если вы зарегистрируетесь по ссылкам из статей, я могу получить комиссию.',
    disclaimerLink: 'Как это работает?',
    notFoundTitle: 'Страница не найдена',
    notFoundText: 'Страница, которую вы ищете, не существует или была перемещена.',
    notFoundBack: 'На главную',
    playVideo: 'Воспроизвести видео',
    loadEmbed: 'Загрузить',
  },
} satisfies Record<Lang, unknown>;

export type Ui = (typeof ui)['en'];
export const t = (lang: Lang): Ui => ui[lang];

const DATE_LOCALE: Record<Lang, string> = { en: 'en-US', uk: 'uk-UA', ru: 'ru-RU' };

/** "December 4, 2025" / "4 грудня 2025 р." from "YYYY-MM-DD". */
export function formatDate(iso: string, lang: Lang): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(DATE_LOCALE[lang], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
