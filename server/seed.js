import { tx, uniqueSlug } from './db.js';

const I = (amount, unit, name) => ({ amount, unit, name });
const S = (text, minutes = 0) => ({ text, timer: minutes ? minutes * 60 : null });

export const SEED_RECIPES = [
  {
    title: 'Orecchiette e cime di rapa',
    excerpt: 'Il piatto simbolo della Puglia: pasta fresca, cime di rapa saltate con aglio, acciuga e peperoncino.',
    category: 'Primi', difficulty: 'Facile', prep: 20, cook: 20, servings: 4, emoji: '🍝', featured: 1,
    image: 'https://blog.giallozafferano.it/dulcisinforno/wp-content/uploads/2021/01/Orecchiette-con-cime-di-rapa-3139.jpg',
    tags: ['puglia', 'pasta', 'vegetariano-friendly', 'tradizione'],
    ingredients: [I(320, 'g', 'orecchiette'), I(800, 'g', 'cime di rapa'), I(2, 'spicchi', 'aglio'), I(4, '', 'filetti di acciuga sott\'olio'), I(1, '', 'peperoncino'), I(4, 'cucchiai', 'olio extravergine d\'oliva'), I(null, '', 'sale q.b.')],
    steps: [
      S('Pulisci le cime di rapa tenendo solo le foglie tenere e le cimette; lavale bene.'),
      S('Porta a bollore abbondante acqua salata e cuoci le orecchiette insieme alle cime.', 12),
      S('In una padella scalda l\'olio con l\'aglio, il peperoncino e le acciughe fino a farle sciogliere.', 4),
      S('Scola pasta e cime tenendo un mestolo di acqua di cottura e salta tutto in padella a fuoco vivo.', 2),
      S('Impiatta con un filo d\'olio a crudo e, se ti piace, una spolverata di pangrattato tostato.'),
    ],
  },
  {
    title: 'Cozze gratinate',
    excerpt: 'Cozze aperte al forno e coperte da un crumble croccante di pane, prezzemolo, aglio e pecorino.',
    category: 'Antipasti', difficulty: 'Media', prep: 30, cook: 15, servings: 4, emoji: '🦪', featured: 0,
    image: 'https://www.cucchiaio.it/content/cucchiaio/it/ricette/2009/11/ricetta-cozze-gratinate/jcr:content/header-par/image_single.img.jpg/1565184135090.jpg?im=Resize=(1968)',
    tags: ['pesce', 'forno', 'antipasto'],
    ingredients: [I(1, 'kg', 'cozze'), I(100, 'g', 'pangrattato'), I(30, 'g', 'pecorino grattugiato'), I(1, 'mazzetto', 'prezzemolo'), I(1, 'spicchio', 'aglio'), I(3, 'cucchiai', 'olio extravergine d\'oliva')],
    steps: [
      S('Pulisci le cozze raschiando i gusci ed eliminando il bisso, poi sciacquale sotto acqua corrente.'),
      S('Aprile in padella coperta a fuoco vivo, poi stacca metà guscio lasciando il frutto.', 5),
      S('Mescola pangrattato, pecorino, prezzemolo e aglio tritati e un filo d\'olio fino a ottenere un composto sabbioso.'),
      S('Copri ogni cozza con il composto e disponile su una teglia.'),
      S('Gratina in forno statico a 220 °C finché la superficie è dorata.', 10),
    ],
  },
  {
    title: 'Sospiri biscegliesi',
    excerpt: 'Soffici dolcetti di pasta biscotto farciti di crema pasticciera e glassati: una carezza pugliese.',
    category: 'Dolci', difficulty: 'Difficile', prep: 60, cook: 25, servings: 12, emoji: '🍰', featured: 1,
    image: 'https://www.laterradipuglia.it/wp-content/uploads/tette-delle-monache-.jpeg',
    tags: ['puglia', 'dolce', 'tradizione', 'crema'],
    ingredients: [I(6, '', 'uova'), I(150, 'g', 'zucchero'), I(150, 'g', 'farina 00'), I(500, 'ml', 'latte intero'), I(4, '', 'tuorli'), I(120, 'g', 'zucchero per la crema'), I(40, 'g', 'amido di mais'), I(1, '', 'scorza di limone'), I(200, 'g', 'zucchero a velo per la glassa')],
    steps: [
      S('Monta le uova con lo zucchero per 10 minuti fino a ottenere un composto chiaro e spumoso.', 10),
      S('Incorpora la farina setacciata con movimenti dal basso verso l\'alto, senza smontare.'),
      S('Distribuisci l\'impasto a mezze sfere su una teglia con carta forno e cuoci a 180 °C.', 15),
      S('Prepara la crema: scalda il latte con la scorza, lavora tuorli, zucchero e amido, unisci il latte e cuoci mescolando.', 8),
      S('Lascia raffreddare le sfere, farciscile con la crema e glassale con zucchero a velo e acqua.'),
    ],
  },
  {
    title: 'Focaccia barese',
    excerpt: 'Alta, soffice, con pomodorini e olive: l\'impasto con patata che profuma di domenica in famiglia.',
    category: 'Lievitati', difficulty: 'Media', prep: 40, cook: 30, servings: 6, emoji: '🫓', featured: 0,
    image: '',
    tags: ['puglia', 'lievitato', 'forno'],
    ingredients: [I(500, 'g', 'farina di semola rimacinata'), I(150, 'g', 'patata lessa schiacciata'), I(400, 'ml', 'acqua tiepida'), I(7, 'g', 'lievito di birra secco'), I(10, 'g', 'sale'), I(250, 'g', 'pomodorini'), I(100, 'g', 'olive baresane'), I(6, 'cucchiai', 'olio extravergine d\'oliva')],
    steps: [
      S('Sciogli il lievito nell\'acqua tiepida e impastalo con farina, patata e sale fino a un impasto morbido.', 10),
      S('Lascia lievitare in una ciotola coperta fino al raddoppio.', 90),
      S('Stendi l\'impasto in una teglia ben oliata e lascia riposare ancora.', 30),
      S('Condisci con pomodorini schiacciati, olive, un filo d\'olio e un pizzico di sale.'),
      S('Inforna a 220 °C fino a doratura.', 30),
    ],
  },
  {
    title: 'Polpo alla pignata',
    excerpt: 'Polpo morbidissimo cotto lentamente con cipolla, pomodorini e un tocco d\'alloro.',
    category: 'Secondi', difficulty: 'Media', prep: 20, cook: 90, servings: 4, emoji: '🐙', featured: 0,
    image: '',
    tags: ['pesce', 'tradizione', 'cottura-lenta'],
    ingredients: [I(1, 'kg', 'polpo'), I(2, '', 'cipolle'), I(300, 'g', 'pomodorini'), I(2, '', 'foglie di alloro'), I(4, 'cucchiai', 'olio extravergine d\'oliva'), I(1, 'bicchiere', 'vino bianco'), I(null, '', 'pepe nero q.b.')],
    steps: [
      S('Pulisci il polpo e taglialo a pezzi.'),
      S('Soffriggi le cipolle affettate nell\'olio finché sono trasparenti.', 8),
      S('Aggiungi il polpo, sfuma con il vino bianco e lascia evaporare.', 5),
      S('Unisci pomodorini e alloro, copri e cuoci a fuoco dolce, mescolando ogni tanto.', 75),
      S('Spegni, lascia riposare qualche minuto e servi con pane casereccio.'),
    ],
  },
  {
    title: 'Panzerotti pugliesi',
    excerpt: 'Mezzelune fritte croccanti fuori e filanti dentro, ripiene di pomodoro e mozzarella.',
    category: 'Lievitati', difficulty: 'Media', prep: 30, cook: 15, servings: 6, emoji: '🥟', featured: 0,
    image: '',
    tags: ['puglia', 'fritto', 'street-food'],
    ingredients: [I(500, 'g', 'farina 0'), I(250, 'ml', 'acqua tiepida'), I(5, 'g', 'lievito di birra'), I(10, 'g', 'sale'), I(300, 'g', 'mozzarella'), I(250, 'g', 'passata di pomodoro'), I(null, '', 'olio di semi per friggere')],
    steps: [
      S('Impasta farina, acqua, lievito e sale per ottenere un panetto liscio.', 10),
      S('Fai lievitare coperto finché è raddoppiato.', 120),
      S('Stendi dischi di 12 cm, farcisci con mozzarella e passata e chiudi a mezzaluna sigillando bene.'),
      S('Friggi in olio a 175 °C girandoli a metà cottura finché sono dorati.', 4),
      S('Scola su carta assorbente e servi subito, ben caldi.'),
    ],
  },
];

export function seedIfEmpty(db) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM recipes').get();
  if (n > 0) return false;
  const insert = db.prepare(`INSERT INTO recipes
    (slug, title, excerpt, category, difficulty, prep_minutes, cook_minutes, servings, image, emoji,
     ingredients, steps, tags, featured, views, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now', ?))`);
  tx(db, () => {
    SEED_RECIPES.forEach((r, i) => {
      insert.run(
        uniqueSlug(db, r.title), r.title, r.excerpt, r.category, r.difficulty, r.prep, r.cook, r.servings,
        r.image, r.emoji, JSON.stringify(r.ingredients), JSON.stringify(r.steps), JSON.stringify(r.tags),
        r.featured, 40 + i * 17, `-${i * 3} days`,
      );
    });
  });
  return true;
}
