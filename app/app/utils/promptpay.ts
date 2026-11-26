// Thai QR / PromptPay payload (EMVCo merchant-presented QR, BOT spec).
// A dynamic QR carries the exact amount, so the payer's banking app fills it
// in and shows the account name before they confirm.

function tlv(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, '0')}${value}`
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), as required by EMVCo tag 63. */
export function crc16(s: string): string {
  let crc = 0xffff
  for (const b of new TextEncoder().encode(s)) {
    crc ^= b << 8
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/** Normalises a PromptPay ID: mobile 0XXXXXXXXX → tag 01, 13-digit ID card/tax → tag 02. */
function target(id: string): string {
  const digits = id.replace(/\D/g, '')
  if (digits.length >= 13) return tlv('02', digits)
  // Mobile: drop the leading 0, add country code 66, zero-pad to 13 digits.
  return tlv('01', `66${digits.replace(/^0/, '')}`.padStart(13, '0'))
}

/** PromptPay QR payload for `id` (mobile or national/tax ID); `amountBaht` makes it a one-time QR with a fixed amount. */
export function promptPayPayload(id: string, amountBaht?: number): string {
  const body = [
    tlv('00', '01'),
    tlv('01', amountBaht ? '12' : '11'), // 12 = dynamic (single use, amount fixed), 11 = static
    tlv('29', tlv('00', 'A000000677010111') + target(id)),
    tlv('53', '764'), // THB
    ...(amountBaht ? [tlv('54', amountBaht.toFixed(2))] : []),
    tlv('58', 'TH'),
  ].join('')
  const withCrcTag = `${body}6304`
  return withCrcTag + crc16(withCrcTag)
}

/** 0968870831 → 096-887-0831 (display only). */
export function formatPromptPayId(id: string): string {
  const d = id.replace(/\D/g, '')
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d
}
