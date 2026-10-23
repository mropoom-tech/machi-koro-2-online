import { useState } from 'react';
import { useI18n } from '../i18n';
import { Modal } from './ui';

type Section = { title: string; body: string[] };

const RULES: Record<'th' | 'en', Section[]> = {
  th: [
    { title: '🎯 เป้าหมาย', body: [
      'สร้างแลนด์มาร์กให้ครบ 3 แห่งก่อนคนอื่น — หรือสร้าง "ฐานปล่อยจรวด" ได้ก็ชนะทันที',
      'ทุกคนเริ่มเกมด้วย 5 เหรียญ และยังไม่มีการ์ดเลย',
    ] },
    { title: '🏗️ ช่วงเริ่มต้น (3 รอบ)', body: [
      'แต่ละคนผลัดกันซื้อกิจการ (ไม่ใช่แลนด์มาร์ก) ได้ตาละ 1 ใบ หรือจะผ่านก็ได้ ครบ 3 รอบแล้วจึงเริ่มทอยเต๋า',
    ] },
    { title: '🔁 ในหนึ่งเทิร์น', body: [
      '1. ทอยลูกเต๋า 1 หรือ 2 ลูก (เลือกได้ทุกเทิร์น)',
      '2. การ์ดของทุกคนที่มีตัวเลขตรงกับแต้มรวมจะทำงาน และรับ/จ่ายเหรียญ',
      '3. ซื้อการ์ดจากตลาดได้ 1 ใบ (กิจการหรือแลนด์มาร์ก) หรือผ่าน',
      'ถ้าหลังทอยแล้วคุณไม่มีเหรียญเลย จะได้ 1 เหรียญจากธนาคาร',
    ] },
    { title: '🎨 สีการ์ดทำงานเมื่อไหร่', body: [
      '🔵 ฟ้า — ทำงานในเทิร์นของทุกคน รับเหรียญจากธนาคาร',
      '🟢 เขียว — ทำงานเฉพาะเทิร์นของคุณ รับเหรียญจากธนาคาร',
      '🔴 แดง — ทำงานในเทิร์นของคนอื่น รับเหรียญจากคนที่ทอย',
      '🟣 ม่วง — ทำงานเฉพาะเทิร์นของคุณ รับเหรียญจากผู้เล่นคนอื่น หรือแลกการ์ด',
      'ลำดับ: แดง → ฟ้าและเขียว → ม่วง  · ถ้าคนจ่ายมีเงินไม่พอ จ่ายเท่าที่มี ธนาคารไม่จ่ายแทน',
    ] },
    { title: '🏛️ แลนด์มาร์ก', body: [
      'ราคาแลนด์มาร์กขึ้นอยู่กับว่าคุณมีแลนด์มาร์กอยู่แล้วกี่แห่ง (ราคา 3 เหรียญบนการ์ด = แห่งที่ 1 / 2 / 3)',
      'บางใบมีผลกับผู้เล่นทุกคน บางใบเฉพาะผู้สร้าง — กดดูรายละเอียดการ์ดได้ทุกใบ',
    ] },
    { title: '💡 เคล็ดลับ', body: [
      'การ์ดเลข 1–6 เหมาะกับทอยลูกเดียว การ์ดเลข 7 ขึ้นไปต้องทอย 2 ลูก',
      'สัญลักษณ์บนการ์ดสำคัญ: การ์ดคอมโบนับจำนวนการ์ดสัญลักษณ์เดียวกันที่คุณมี',
    ] },
  ],
  en: [
    { title: '🎯 Goal', body: [
      'Be the first to build 3 landmarks — or build the Launch Pad to win instantly.',
      'Everyone starts with 5 coins and no cards.',
    ] },
    { title: '🏗️ Setup (3 rounds)', body: [
      'Players take turns buying one establishment (not a landmark) each, or passing. After 3 rounds the dice come out.',
    ] },
    { title: '🔁 Your turn', body: [
      '1. Roll 1 or 2 dice (your choice every turn).',
      '2. Every card whose number matches the total activates and pays out.',
      '3. Buy one card from the market (establishment or landmark), or pass.',
      'If you have no coins after rolling, the bank gives you 1.',
    ] },
    { title: '🎨 When each colour activates', body: [
      '🔵 Blue — on anyone’s turn, earn from the bank.',
      '🟢 Green — on your turn only, earn from the bank.',
      '🔴 Red — on other players’ turns, take coins from the roller.',
      '🟣 Purple — on your turn only, take from other players or swap cards.',
      'Order: red → blue & green → purple. A player who can’t pay in full pays what they have; the bank doesn’t cover it.',
    ] },
    { title: '🏛️ Landmarks', body: [
      'A landmark’s price depends on how many you already own (the 3 prices on the card are for your 1st / 2nd / 3rd).',
      'Some affect every player, some only their builder — tap any card for its details.',
    ] },
    { title: '💡 Tips', body: [
      'Cards numbered 1–6 suit one die; 7 and up need two dice.',
      'Symbols matter: combo cards count the matching symbols you own.',
    ] },
  ],
};

export function HowToPlayButton({ className = '' }: { className?: string }) {
  const { u, lang } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={u('how_to_play')}
        className={`rounded-full px-3 py-1 text-sm font-semibold ${className}`}>
        ❓ <span className="hidden sm:inline">{u('how_to_play')}</span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} wide>
        <h3 className="mb-4 text-xl font-bold">{u('how_to_play')}</h3>
        <div className="space-y-4 text-left">
          {RULES[lang].map((s) => (
            <section key={s.title}>
              <h4 className="mb-1 font-semibold text-teal-800">{s.title}</h4>
              {s.body.map((line) => <p key={line} className="text-sm leading-relaxed text-slate-700">{line}</p>)}
            </section>
          ))}
        </div>
      </Modal>
    </>
  );
}
