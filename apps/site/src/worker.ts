/// <reference types="@cloudflare/workers-types" />
// Worker entry. Static pages are served from `dist` by Workers static assets; this code only
// runs for /api/* (see `run_worker_first` in wrangler.jsonc) and for preview noindex headers.
import { EmailMessage } from 'cloudflare:email';

interface Env {
  ASSETS: Fetcher;
  ENVIRONMENT: 'production' | 'preview';
  /** Cloudflare Email Routing `send_email` binding. TODO: add to wrangler.jsonc once the zone is on Cloudflare. */
  CONTACT_EMAIL?: SendEmail;
  /** Recipient of contact form messages (must be a verified Email Routing destination). */
  CONTACT_TO?: string;
  /** Sender address on the zone, e.g. "contact-form@slobodskyi.com". */
  CONTACT_FROM?: string;
  /** Turnstile secret (wrangler secret put TURNSTILE_SECRET). */
  TURNSTILE_SECRET?: string;
}

const LIMITS = { name: 256, email: 256, message: 5000 };

const wantsJson = (request: Request): boolean =>
  (request.headers.get('Accept') ?? '').includes('application/json');

/** JSON for fetch() callers, 303 back to the form for plain HTML form posts. */
function reply(request: Request, ok: boolean, status: number, page: string): Response {
  if (wantsJson(request)) return Response.json({ ok }, { status });
  const back = new URL(page.startsWith('/') ? page : '/contacts', request.url);
  back.hash = ok ? 'contact-sent' : 'contact-error';
  return Response.redirect(back.toString(), 303);
}

async function verifyTurnstile(secret: string, token: string, ip: string | null): Promise<boolean> {
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
  });
  const data: { success?: boolean } = await res.json();
  return data.success === true;
}

const b64 = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

/** Minimal RFC 5322 message: UTF-8 subject (encoded-word) and base64 text body. */
function mimeMessage(opts: {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
}): string {
  const lines = [
    `From: slobodskyi.com <${opts.from}>`,
    `To: <${opts.to}>`,
    `Reply-To: <${opts.replyTo}>`,
    `Subject: =?UTF-8?B?${b64(opts.subject)}?=`,
    `Message-ID: <${crypto.randomUUID()}@slobodskyi.com>`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    (b64(opts.text).match(/.{1,76}/g) ?? []).join('\r\n'),
  ];
  return lines.join('\r\n');
}

async function handleContact(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST')
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply(request, false, 400, '/contacts');
  }
  const field = (name: string) => String(form.get(name) ?? '').trim();
  const page = field('page') || '/contacts';
  const name = field('name').slice(0, LIMITS.name);
  const email = field('email').slice(0, LIMITS.email);
  const message = field('message').slice(0, LIMITS.message);

  // Honeypot: pretend success to bots.
  if (field('company')) return reply(request, true, 200, page);
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || !message) return reply(request, false, 400, page);

  if (!env.TURNSTILE_SECRET || !env.CONTACT_EMAIL || !env.CONTACT_TO || !env.CONTACT_FROM) {
    console.error(
      'contact form is not configured (TURNSTILE_SECRET, CONTACT_EMAIL, CONTACT_TO, CONTACT_FROM)',
    );
    return reply(request, false, 503, page);
  }
  const token = field('cf-turnstile-response');
  if (
    !token ||
    !(await verifyTurnstile(env.TURNSTILE_SECRET, token, request.headers.get('CF-Connecting-IP')))
  )
    return reply(request, false, 403, page);

  const raw = mimeMessage({
    from: env.CONTACT_FROM,
    to: env.CONTACT_TO,
    replyTo: email,
    subject: `Contact form: ${name || email}`,
    text: `Name: ${name}\nEmail: ${email}\nPage: ${page}\n\n${message}\n`,
  });
  try {
    await env.CONTACT_EMAIL.send(new EmailMessage(env.CONTACT_FROM, env.CONTACT_TO, raw));
  } catch (e) {
    console.error('contact form: send failed', e);
    return reply(request, false, 502, page);
  }
  return reply(request, true, 200, page);
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/contact') return handleContact(request, env);
    if (url.pathname.startsWith('/api/')) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }

    const response = await env.ASSETS.fetch(request);
    if (env.ENVIRONMENT !== 'preview') return response;

    const headers = new Headers(response.headers);
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
} satisfies ExportedHandler<Env>;
