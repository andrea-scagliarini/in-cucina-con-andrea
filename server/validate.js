import { HttpError } from './lib/http.js';

export const CATEGORIES = ['Antipasti', 'Primi', 'Secondi', 'Dolci', 'Lievitati', 'Contorni'];
export const DIFFICULTIES = ['Facile', 'Media', 'Difficile'];

const str = (v, max, field, { min = 0, required = false } = {}) => {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  if (required && !s) throw new HttpError(400, `Il campo "${field}" è obbligatorio`);
  if (s.length < min) throw new HttpError(400, `Il campo "${field}" è troppo corto`);
  if (s.length > max) throw new HttpError(400, `Il campo "${field}" supera ${max} caratteri`);
  return s;
};

const int = (v, min, max, field, fallback) => {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `"${field}" deve essere tra ${min} e ${max}`);
  return n;
};

const safeImage = (v) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return '';
  if (s.startsWith('/uploads/') && !s.includes('..')) return s;
  try {
    const u = new URL(s);
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.href.slice(0, 600);
  } catch {
    /* ignorata */
  }
  throw new HttpError(400, 'URL immagine non valido');
};

export function validateRecipe(input) {
  const category = str(input.category, 30, 'categoria', { required: true });
  if (!CATEGORIES.includes(category)) throw new HttpError(400, 'Categoria non valida');
  const difficulty = str(input.difficulty ?? 'Facile', 20, 'difficoltà');
  if (!DIFFICULTIES.includes(difficulty)) throw new HttpError(400, 'Difficoltà non valida');

  const ingredients = (Array.isArray(input.ingredients) ? input.ingredients : []).slice(0, 80).map((i) => {
    const amount = i?.amount === null || i?.amount === undefined || i?.amount === '' ? null : Number(i.amount);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 100000))
      throw new HttpError(400, 'Quantità ingrediente non valida');
    return { amount, unit: str(i?.unit, 20, 'unità'), name: str(i?.name, 120, 'ingrediente', { required: true }) };
  });

  const steps = (Array.isArray(input.steps) ? input.steps : []).slice(0, 60).map((s) => ({
    text: str(s?.text, 1200, 'passaggio', { required: true }),
    timer: int(s?.timer, 0, 86400, 'timer', 0) || null,
  }));

  const tags = [...new Set((Array.isArray(input.tags) ? input.tags : []).map((t) => str(t, 24, 'tag').toLowerCase()).filter(Boolean))].slice(0, 10);

  return {
    title: str(input.title, 120, 'titolo', { required: true, min: 3 }),
    excerpt: str(input.excerpt, 400, 'descrizione'),
    category,
    difficulty,
    prep_minutes: int(input.prepMinutes, 0, 2880, 'preparazione', 0),
    cook_minutes: int(input.cookMinutes, 0, 2880, 'cottura', 0),
    servings: int(input.servings, 1, 100, 'porzioni', 4),
    image: safeImage(input.image),
    emoji: [...str(input.emoji || '🍽️', 16, 'emoji')].slice(0, 4).join('') || '🍽️',
    ingredients,
    steps,
    tags,
    featured: input.featured ? 1 : 0,
    published: input.published === false ? 0 : 1,
  };
}

export function validateComment(input) {
  return {
    author: str(input.author, 40, 'nome', { required: true, min: 2 }),
    body: str(input.body, 1000, 'commento', { required: true, min: 2 }),
  };
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
export function validateEmail(v) {
  const email = str(v, 254, 'email', { required: true }).toLowerCase();
  if (!EMAIL.test(email)) throw new HttpError(400, 'Indirizzo email non valido');
  return email;
}

/** Riconosce il tipo reale dell'immagine dai magic bytes. */
export function sniffImage(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return '.png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  if (buf.toString('ascii', 0, 3) === 'GIF') return '.gif';
  return null;
}
