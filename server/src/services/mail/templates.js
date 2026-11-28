'use strict';

/**
 * Plannity's emails, in Thai and English. Each returns { subject, html, text }.
 * Values are escaped here; the layout only places them.
 */
const { layout, text, esc } = require('./layout');

const ROLES = {
  th: { owner: 'เจ้าของ', admin: 'แอดมิน', editor: 'ผู้แก้ไข', viewer: 'ผู้ดู' },
  en: { owner: 'Owner', admin: 'Admin', editor: 'Editor', viewer: 'Viewer' },
};

const COMMON = {
  th: { fallback: 'ปุ่มกดไม่ได้? คัดลอกลิงก์นี้ไปเปิดในเบราว์เซอร์', hi: (n) => (n ? `สวัสดีคุณ ${n}` : 'สวัสดี') },
  en: { fallback: "Button not working? Copy this link into your browser:", hi: (n) => (n ? `Hi ${n},` : 'Hi there,') },
};

const lang = (l) => (l === 'en' ? 'en' : 'th');
const b = (s) => `<strong class="pl-fg" style="color:#211C3A;font-weight:700;">${esc(s)}</strong>`;

function formatDate(value, locale) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value ?? '');
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'th-TH', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(d);
}

function render(o) {
  return { subject: o.subject, html: layout(o), text: text(o) };
}

/** Team invitation: someone added this email to a brand. */
function invitation({ locale, siteUrl, inviterName, brandName, role, link, expiresAt }) {
  const l = lang(locale);
  const roleLabel = ROLES[l][role] ?? role;
  const expires = formatDate(expiresAt, l);
  if (l === 'th') {
    return render({
      locale: l, siteUrl,
      subject: `${inviterName} ชวนคุณร่วมทีม ${brandName} บน Plannity`,
      preheader: `เข้าร่วมแบรนด์ ${brandName} ในบทบาท${roleLabel} — คำเชิญหมดอายุ ${expires}`,
      eyebrow: 'คำเชิญเข้าทีม',
      title: `มาวางแผนคอนเทนต์ ${brandName} ด้วยกัน`,
      introHtml: `${b(inviterName)} ชวนคุณเข้าร่วมแบรนด์ ${b(brandName)} บน Plannity เพื่อวางแผน เขียน และจัดตารางคอนเทนต์ไปพร้อมกันทั้งทีม`,
      introText: `${inviterName} ชวนคุณเข้าร่วมแบรนด์ "${brandName}" บน Plannity`,
      details: [{ label: 'แบรนด์', value: brandName }, { label: 'บทบาท', value: roleLabel }, { label: 'หมดอายุ', value: expires }],
      button: { label: 'รับคำเชิญ', url: link },
      note: 'ถ้ายังไม่มีบัญชี ระบบจะให้สมัครด้วยอีเมลนี้ก่อน · ถ้าไม่รู้จักคำเชิญนี้ ไม่ต้องทำอะไร',
      fallbackLabel: COMMON.th.fallback,
      footer: 'คุณได้รับอีเมลนี้เพราะมีคนเชิญอีเมลนี้เข้าทีมบน Plannity',
    });
  }
  return render({
    locale: l, siteUrl,
    subject: `${inviterName} invited you to ${brandName} on Plannity`,
    preheader: `Join ${brandName} as ${roleLabel} — the invitation expires ${expires}`,
    eyebrow: 'Team invitation',
    title: `Let's plan ${brandName} together`,
    introHtml: `${b(inviterName)} invited you to join ${b(brandName)} on Plannity, to plan, write and schedule content together as a team.`,
    introText: `${inviterName} invited you to join "${brandName}" on Plannity.`,
    details: [{ label: 'Brand', value: brandName }, { label: 'Role', value: roleLabel }, { label: 'Expires', value: expires }],
    button: { label: 'Accept invitation', url: link },
    note: "No account yet? You'll sign up with this email first. Not expecting this? You can ignore it.",
    fallbackLabel: COMMON.en.fallback,
    footer: 'You got this email because someone invited this address to a team on Plannity.',
  });
}

/** Sign-up: confirm the email address. */
function confirmEmail({ locale, siteUrl, name, link }) {
  const l = lang(locale);
  if (l === 'th') {
    return render({
      locale: l, siteUrl,
      subject: 'ยืนยันอีเมลของคุณ — Plannity',
      preheader: 'กดยืนยันครั้งเดียว แล้วเริ่มวางแผนคอนเทนต์ได้เลย',
      eyebrow: 'ยินดีต้อนรับ',
      title: 'ยืนยันอีเมลของคุณ',
      introHtml: `${esc(COMMON.th.hi(name))} ขอบคุณที่สมัคร Plannity — กดปุ่มด้านล่างเพื่อยืนยันอีเมล แล้วรับเครดิตทดลองใช้เพื่อเริ่มวางแผนคอนเทนต์ได้ทันที`,
      introText: `${COMMON.th.hi(name)} ขอบคุณที่สมัคร Plannity กดลิงก์ด้านล่างเพื่อยืนยันอีเมล`,
      button: { label: 'ยืนยันอีเมล', url: link },
      note: 'ลิงก์นี้ใช้ได้ครั้งเดียว · ถ้าคุณไม่ได้สมัคร ไม่ต้องทำอะไร บัญชีจะไม่ถูกเปิดใช้',
      fallbackLabel: COMMON.th.fallback,
      footer: 'คุณได้รับอีเมลนี้เพราะมีการสมัคร Plannity ด้วยอีเมลนี้',
    });
  }
  return render({
    locale: l, siteUrl,
    subject: 'Confirm your email — Plannity',
    preheader: "One click and you're in — start planning your content.",
    eyebrow: 'Welcome',
    title: 'Confirm your email',
    introHtml: `${esc(COMMON.en.hi(name))} thanks for signing up for Plannity. Confirm your email below to unlock your trial credits and start planning.`,
    introText: `${COMMON.en.hi(name)} thanks for signing up for Plannity. Confirm your email with the link below.`,
    button: { label: 'Confirm email', url: link },
    note: "This link works once. If you didn't sign up, ignore this email and the account stays inactive.",
    fallbackLabel: COMMON.en.fallback,
    footer: 'You got this email because this address was used to sign up for Plannity.',
  });
}

/** Forgot password: link to set a new one. */
function resetPassword({ locale, siteUrl, name, link }) {
  const l = lang(locale);
  if (l === 'th') {
    return render({
      locale: l, siteUrl,
      subject: 'ตั้งรหัสผ่านใหม่ — Plannity',
      preheader: 'มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ',
      eyebrow: 'ความปลอดภัยของบัญชี',
      title: 'ตั้งรหัสผ่านใหม่',
      introHtml: `${esc(COMMON.th.hi(name))} เราได้รับคำขอตั้งรหัสผ่านใหม่สำหรับบัญชี Plannity ของคุณ กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่`,
      introText: `${COMMON.th.hi(name)} เราได้รับคำขอตั้งรหัสผ่านใหม่สำหรับบัญชี Plannity ของคุณ`,
      button: { label: 'ตั้งรหัสผ่านใหม่', url: link },
      note: 'ลิงก์นี้ใช้ได้ครั้งเดียว · ถ้าคุณไม่ได้ขอ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ',
      fallbackLabel: COMMON.th.fallback,
      footer: 'คุณได้รับอีเมลนี้เพราะมีการขอรีเซ็ตรหัสผ่านของบัญชีนี้บน Plannity',
    });
  }
  return render({
    locale: l, siteUrl,
    subject: 'Reset your password — Plannity',
    preheader: 'Someone asked to reset the password for your account.',
    eyebrow: 'Account security',
    title: 'Reset your password',
    introHtml: `${esc(COMMON.en.hi(name))} we got a request to reset the password for your Plannity account. Choose a new one with the button below.`,
    introText: `${COMMON.en.hi(name)} we got a request to reset the password for your Plannity account.`,
    button: { label: 'Set a new password', url: link },
    note: "This link works once. If you didn't ask for this, ignore it — your password stays the same.",
    fallbackLabel: COMMON.en.fallback,
    footer: 'You got this email because a password reset was requested for this account on Plannity.',
  });
}

module.exports = { invitation, confirmEmail, resetPassword, formatDate };
