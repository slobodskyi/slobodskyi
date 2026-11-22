declare namespace App {
  interface Locals {
    /** Folder of the record being rendered ("content/guides/chatgpt"): MDX images resolve against it. */
    recordDir?: string;
    /** Home page blocks placed inside the MDX body by components/HomeH2.astro. */
    home?: {
      heroAfter?: string | undefined;
      heroAlt: string;
      cardsBefore?: string | undefined;
      cards: import('./components/Cards.astro').CardItem[];
    };
  }
}
