// The fixed set of components available in MDX (see CLAUDE.md). Passed to every <Content />.
import Shot from './Shot.astro';
import Callout from './Callout.astro';
import Answer from './Answer.astro';
import FAQ from './FAQ.astro';
import Quiz from './Quiz.astro';
import YouTube from './YouTube.astro';
import BuyMeACoffee from './BuyMeACoffee.astro';
import VideoAsk from './VideoAsk.astro';

export const mdxComponents = { Shot, Callout, Answer, FAQ, Quiz, YouTube, BuyMeACoffee, VideoAsk };
