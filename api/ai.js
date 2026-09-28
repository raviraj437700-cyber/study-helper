export const config = { maxDuration: 60 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';

async function gemini(parts, json) {
  let lastError = 'AI se jawab nahi aaya';
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const body = { contents: [{ parts }] };
      if (json) body.generationConfig = { responseMimeType: 'application/json' };
      const r = await fetch(URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify(body)
      });
      const data = await r.json();
      const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('');
      if (text) return { text };
      lastError = data?.error?.message || lastError;
      if (![429, 500, 503].includes(r.status)) break;
    } catch (e) {
      lastError = 'Server error';
    }
    await sleep(2000 * (attempt + 1));
  }
  return { error: 'AI abhi busy hai, 1-2 minute baad dobara try karo. 🙏\n\n(' + lastError + ')' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST' });
  const { mode } = req.body || {};

  if (mode === 'roadmap') {
    const { name, days, hours, subjects } = req.body;
    if (!days || !hours || !Array.isArray(subjects) || !subjects.length)
      return res.status(400).json({ error: 'Data adhoora hai' });
    const list = subjects.slice(0, 12).map(s => `- ${String(s.name).slice(0, 40)}: ${Number(s.chapters)} chapters`).join('\n');
    const total = subjects.reduce((a, s) => a + (Number(s.chapters) || 0), 0);
    const prompt = `Tum ek expert study planner ho. Student ka naam: ${String(name || 'Student').slice(0, 40)}.
Exam me bache din: ${Number(days)}. Roz padhne ke ghante: ${Number(hours)}.
Subjects:
${list}
Total chapters: ${total}. Total available hours: ${Number(days) * Number(hours)}.

Hinglish me ek practical roadmap banao:
1. Short summary: total time, har subject ko kitna time (kathin/zyada chapters wale ko zyada)
2. Plan: agar 30 din ya kam hain to din-wise, warna week-wise plan jisme har din ka pattern ho (kaunsa subject/chapter aur kitne ghante)
3. Aakhri 15-20% time sirf revision aur mock test ke liye rakho
4. 4-5 practical tips

Rules: kisi din ke ghante roz ke limit se zyada mat rakho. Agar time bahut kam hai to saaf batao aur priority ke hisab se chapters chuno. Simple text me likho, markdown tables mat use karo.`;
    const out = await gemini([{ text: prompt }], false);
    return out.text ? res.status(200).json(out) : res.status(500).json(out);
  }

  if (mode === 'flashcards') {
    const { pdf, count, lang } = req.body;
    if (!pdf) return res.status(400).json({ error: 'PDF nahi mila' });
    const n = Math.min(40, Math.max(5, parseInt(count) || 25));
    const prompt = `Is chapter ke PDF se ${n} flashcards banao jo turant yaad karne me help karein. Bhasha: ${lang || 'Hinglish'}.
Sirf zaroori definitions, formulas, facts, dates, aur concepts lo. Har card chhota aur clear ho.
Sirf ye JSON array do, aur kuch nahi: [{"q":"sawal","a":"jawab"}]`;
    const out = await gemini([{ text: prompt }, { inline_data: { mime_type: 'application/pdf', data: pdf } }], true);
    if (!out.text) return res.status(500).json(out);
    try {
      const cards = JSON.parse(out.text.replace(/```json|```/g, '').trim());
      return res.status(200).json({ cards });
    } catch (e) {
      return res.status(500).json({ error: 'Flashcards samajh nahi aaye, dobara try karo.' });
    }
  }

  res.status(400).json({ error: 'Galat request' });
}
