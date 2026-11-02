export type TourProblemDifficulty = "easy" | "medium" | "hard";

export type TourProblemSection = {
  id: string;
  title: string;
  topics: { id: string; title: string }[];
};

export type TourProblem = {
  id: string;
  sectionId: string;
  topicId: string;
  difficulty: TourProblemDifficulty;
  prompt: string;
  /** Варианты ответа (один правильный). */
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation: string;
};

export const TOUR_PROBLEM_SECTIONS: TourProblemSection[] = [
  {
    id: "kinematics",
    title: "Кинематика",
    topics: [
      { id: "uniform", title: "Равномерное движение" },
      { id: "accel", title: "Равноускоренное движение" },
    ],
  },
  {
    id: "dynamics",
    title: "Динамика",
    topics: [
      { id: "newton", title: "Законы Ньютона" },
      { id: "friction", title: "Трение" },
    ],
  },
  {
    id: "statics",
    title: "Статика",
    topics: [{ id: "torque", title: "Момент силы" }],
  },
  {
    id: "conservation",
    title: "Законы сохранения",
    topics: [
      { id: "energy", title: "Энергия" },
      { id: "momentum", title: "Импульс" },
    ],
  },
  {
    id: "oscillations",
    title: "Механические колебания",
    topics: [{ id: "spring", title: "Пружинный маятник" }],
  },
  {
    id: "mkt",
    title: "Молекулярная физика",
    topics: [{ id: "ideal_gas", title: "Идеальный газ" }],
  },
  {
    id: "thermo",
    title: "Термодинамика",
    topics: [{ id: "first_law", title: "Первое начало" }],
  },
  {
    id: "electrostatics",
    title: "Электростатика",
    topics: [{ id: "coulomb", title: "Закон Кулона" }],
  },
  {
    id: "current",
    title: "Постоянный ток",
    topics: [
      { id: "ohm", title: "Закон Ома" },
      { id: "power", title: "Мощность" },
    ],
  },
  {
    id: "magnetism",
    title: "Магнитное поле",
    topics: [{ id: "ampere", title: "Сила Ампера" }],
  },
  {
    id: "induction",
    title: "Электромагнитная индукция",
    topics: [{ id: "faraday", title: "Закон Фарадея" }],
  },
  {
    id: "optics",
    title: "Оптика",
    topics: [{ id: "lens", title: "Тонкая линза" }],
  },
];

/** Проверенные учебные задачи для демо (без API). */
export const TOUR_PROBLEMS: TourProblem[] = [
  {
    id: "p_kin_1",
    sectionId: "kinematics",
    topicId: "uniform",
    difficulty: "easy",
    prompt:
      "Автомобиль едет равномерно со скоростью 20 м/с. Какой путь он пройдёт за 15 с?",
    options: [
      { id: "a", text: "200 м" },
      { id: "b", text: "300 м" },
      { id: "c", text: "350 м" },
      { id: "d", text: "400 м" },
    ],
    correctOptionId: "b",
    explanation: "s = v·t = 20·15 = 300 м.",
  },
  {
    id: "p_kin_2",
    sectionId: "kinematics",
    topicId: "accel",
    difficulty: "medium",
    prompt:
      "Тело стартует из покоя с ускорением 2 м/с². Какова скорость через 5 с?",
    options: [
      { id: "a", text: "5 м/с" },
      { id: "b", text: "8 м/с" },
      { id: "c", text: "10 м/с" },
      { id: "d", text: "12 м/с" },
    ],
    correctOptionId: "c",
    explanation: "v = v₀ + a·t = 0 + 2·5 = 10 м/с.",
  },
  {
    id: "p_kin_3",
    sectionId: "kinematics",
    topicId: "accel",
    difficulty: "hard",
    prompt:
      "Тело начинает движение из покоя с a = 3 м/с². Какой путь за первые 4 с?",
    options: [
      { id: "a", text: "12 м" },
      { id: "b", text: "18 м" },
      { id: "c", text: "24 м" },
      { id: "d", text: "36 м" },
    ],
    correctOptionId: "c",
    explanation: "s = a·t²/2 = 3·16/2 = 24 м.",
  },
  {
    id: "p_dyn_1",
    sectionId: "dynamics",
    topicId: "newton",
    difficulty: "easy",
    prompt:
      "На тело массой 2 кг действует сила 10 Н. Чему равно ускорение? (Других сил нет.)",
    options: [
      { id: "a", text: "2 м/с²" },
      { id: "b", text: "5 м/с²" },
      { id: "c", text: "8 м/с²" },
      { id: "d", text: "20 м/с²" },
    ],
    correctOptionId: "b",
    explanation: "a = F/m = 10/2 = 5 м/с².",
  },
  {
    id: "p_dyn_2",
    sectionId: "dynamics",
    topicId: "friction",
    difficulty: "medium",
    prompt:
      "Коэффициент трения 0,2, масса бруска 5 кг, g = 10 м/с². Сила трения скольжения равна…",
    options: [
      { id: "a", text: "1 Н" },
      { id: "b", text: "5 Н" },
      { id: "c", text: "10 Н" },
      { id: "d", text: "20 Н" },
    ],
    correctOptionId: "c",
    explanation: "Fтр = μ·N = μ·mg = 0,2·5·10 = 10 Н.",
  },
  {
    id: "p_stat_1",
    sectionId: "statics",
    topicId: "torque",
    difficulty: "medium",
    prompt:
      "Сила 20 Н действует перпендикулярно рычагу на расстоянии 0,5 м от оси. Момент силы равен…",
    options: [
      { id: "a", text: "5 Н·м" },
      { id: "b", text: "10 Н·м" },
      { id: "c", text: "20 Н·м" },
      { id: "d", text: "40 Н·м" },
    ],
    correctOptionId: "b",
    explanation: "M = F·l = 20·0,5 = 10 Н·м.",
  },
  {
    id: "p_cons_1",
    sectionId: "conservation",
    topicId: "energy",
    difficulty: "easy",
    prompt:
      "Тело массой 2 кг подняли на 5 м (g = 10 м/с²). Прирост потенциальной энергии равен…",
    options: [
      { id: "a", text: "50 Дж" },
      { id: "b", text: "100 Дж" },
      { id: "c", text: "150 Дж" },
      { id: "d", text: "200 Дж" },
    ],
    correctOptionId: "b",
    explanation: "ΔEп = mgh = 2·10·5 = 100 Дж.",
  },
  {
    id: "p_cons_2",
    sectionId: "conservation",
    topicId: "momentum",
    difficulty: "medium",
    prompt:
      "Тележка 2 кг движется со скоростью 3 м/с и сталкивается неупруго с покоящейся тележкой 1 кг. Общая скорость после слипания…",
    options: [
      { id: "a", text: "1 м/с" },
      { id: "b", text: "1,5 м/с" },
      { id: "c", text: "2 м/с" },
      { id: "d", text: "3 м/с" },
    ],
    correctOptionId: "c",
    explanation: "m₁v = (m₁+m₂)u ⇒ u = 6/3 = 2 м/с.",
  },
  {
    id: "p_osc_1",
    sectionId: "oscillations",
    topicId: "spring",
    difficulty: "medium",
    prompt:
      "Пружинный маятник: m = 0,25 кг, k = 100 Н/м. Период малых колебаний (π ≈ 3) примерно равен…",
    options: [
      { id: "a", text: "0,1 с" },
      { id: "b", text: "0,3 с" },
      { id: "c", text: "0,5 с" },
      { id: "d", text: "1 с" },
    ],
    correctOptionId: "b",
    explanation: "T = 2π√(m/k) ≈ 6·√0,0025 = 6·0,05 = 0,3 с.",
  },
  {
    id: "p_mkt_1",
    sectionId: "mkt",
    topicId: "ideal_gas",
    difficulty: "easy",
    prompt:
      "В уравнении Клапейрона — Менделеева pV = νRT величина R — это…",
    options: [
      { id: "a", text: "постоянная Больцмана" },
      { id: "b", text: "универсальная газовая постоянная" },
      { id: "c", text: "число Авогадро" },
      { id: "d", text: "молярная масса" },
    ],
    correctOptionId: "b",
    explanation: "R — универсальная газовая постоянная.",
  },
  {
    id: "p_th_1",
    sectionId: "thermo",
    topicId: "first_law",
    difficulty: "medium",
    prompt:
      "Газу сообщили 500 Дж теплоты, при этом он совершил работу 200 Дж. Изменение внутренней энергии равно…",
    options: [
      { id: "a", text: "200 Дж" },
      { id: "b", text: "300 Дж" },
      { id: "c", text: "500 Дж" },
      { id: "d", text: "700 Дж" },
    ],
    correctOptionId: "b",
    explanation: "ΔU = Q − A = 500 − 200 = 300 Дж.",
  },
  {
    id: "p_el_1",
    sectionId: "electrostatics",
    topicId: "coulomb",
    difficulty: "easy",
    prompt:
      "Сила Кулона между двумя точечными зарядами при увеличении расстояния в 2 раза…",
    options: [
      { id: "a", text: "увеличится в 2 раза" },
      { id: "b", text: "увеличится в 4 раза" },
      { id: "c", text: "уменьшится в 2 раза" },
      { id: "d", text: "уменьшится в 4 раза" },
    ],
    correctOptionId: "d",
    explanation: "F ∼ 1/r², при r→2r сила уменьшается в 4 раза.",
  },
  {
    id: "p_cur_1",
    sectionId: "current",
    topicId: "ohm",
    difficulty: "easy",
    prompt: "На участке цепи U = 12 В, R = 4 Ом. Сила тока равна…",
    options: [
      { id: "a", text: "2 А" },
      { id: "b", text: "3 А" },
      { id: "c", text: "4 А" },
      { id: "d", text: "48 А" },
    ],
    correctOptionId: "b",
    explanation: "I = U/R = 12/4 = 3 А.",
  },
  {
    id: "p_cur_2",
    sectionId: "current",
    topicId: "power",
    difficulty: "medium",
    prompt: "I = 2 А, R = 5 Ом. Мощность тепловыделения равна…",
    options: [
      { id: "a", text: "10 Вт" },
      { id: "b", text: "20 Вт" },
      { id: "c", text: "25 Вт" },
      { id: "d", text: "40 Вт" },
    ],
    correctOptionId: "b",
    explanation: "P = I²R = 4·5 = 20 Вт.",
  },
  {
    id: "p_mag_1",
    sectionId: "magnetism",
    topicId: "ampere",
    difficulty: "medium",
    prompt:
      "Проводник длиной 0,5 м с током 4 А перпендикулярен полю B = 0,2 Тл. Модуль силы Ампера…",
    options: [
      { id: "a", text: "0,2 Н" },
      { id: "b", text: "0,4 Н" },
      { id: "c", text: "0,8 Н" },
      { id: "d", text: "4 Н" },
    ],
    correctOptionId: "b",
    explanation: "F = I·l·B = 4·0,5·0,2 = 0,4 Н.",
  },
  {
    id: "p_ind_1",
    sectionId: "induction",
    topicId: "faraday",
    difficulty: "medium",
    prompt:
      "Магнитный поток через контур изменился на 0,4 Вб за 0,2 с. Модуль средней ЭДС индукции…",
    options: [
      { id: "a", text: "0,08 В" },
      { id: "b", text: "0,8 В" },
      { id: "c", text: "2 В" },
      { id: "d", text: "8 В" },
    ],
    correctOptionId: "c",
    explanation: "|ℰ| = |ΔΦ|/Δt = 0,4/0,2 = 2 В.",
  },
  {
    id: "p_opt_1",
    sectionId: "optics",
    topicId: "lens",
    difficulty: "medium",
    prompt:
      "Собирающая линза с F = 20 см. Предмет на расстоянии 40 см. Расстояние до изображения…",
    options: [
      { id: "a", text: "10 см" },
      { id: "b", text: "20 см" },
      { id: "c", text: "40 см" },
      { id: "d", text: "60 см" },
    ],
    correctOptionId: "c",
    explanation: "1/F = 1/d + 1/f ⇒ 1/20 = 1/40 + 1/f ⇒ 1/f = 1/40 ⇒ f = 40 см.",
  },
  {
    id: "p_dyn_3",
    sectionId: "dynamics",
    topicId: "newton",
    difficulty: "hard",
    prompt:
      "Два груза 3 кг и 1 кг связаны нитью через неподвижный блок (g = 10 м/с²). Ускорение системы…",
    options: [
      { id: "a", text: "2,5 м/с²" },
      { id: "b", text: "5 м/с²" },
      { id: "c", text: "7,5 м/с²" },
      { id: "d", text: "10 м/с²" },
    ],
    correctOptionId: "b",
    explanation: "a = g(m₁−m₂)/(m₁+m₂) = 10·2/4 = 5 м/с².",
  },
  {
    id: "p_el_2",
    sectionId: "electrostatics",
    topicId: "coulomb",
    difficulty: "hard",
    prompt:
      "Два одинаковых заряда на расстоянии r отталкиваются с силой F. Если каждый заряд увеличить в 2 раза, а расстояние — в 2 раза, новая сила равна…",
    options: [
      { id: "a", text: "F/4" },
      { id: "b", text: "F/2" },
      { id: "c", text: "F" },
      { id: "d", text: "2F" },
    ],
    correctOptionId: "c",
    explanation: "F' ∼ (2q·2q)/(2r)² = 4/4 · F = F.",
  },
  {
    id: "p_opt_2",
    sectionId: "optics",
    topicId: "lens",
    difficulty: "easy",
    prompt: "Оптическая сила линзы с фокусным расстоянием 0,5 м равна…",
    options: [
      { id: "a", text: "0,5 дптр" },
      { id: "b", text: "1 дптр" },
      { id: "c", text: "2 дптр" },
      { id: "d", text: "5 дптр" },
    ],
    correctOptionId: "c",
    explanation: "D = 1/F = 1/0,5 = 2 дптр.",
  },
  {
    id: "p_stat_2",
    sectionId: "statics",
    topicId: "torque",
    difficulty: "easy",
    prompt:
      "Два одинаковых груза на концах невесомого стержня. Чтобы равновесие сохранилось при удвоении одного груза, его плечо нужно…",
    options: [
      { id: "a", text: "оставить прежним" },
      { id: "b", text: "увеличить в 2 раза" },
      { id: "c", text: "уменьшить в 2 раза" },
      { id: "d", text: "увеличить в 4 раза" },
    ],
    correctOptionId: "c",
    explanation: "M = F·l. При удвоении силы плечо уменьшают вдвое, чтобы моменты совпали.",
  },
  {
    id: "p_osc_2",
    sectionId: "oscillations",
    topicId: "spring",
    difficulty: "easy",
    prompt:
      "Если массу груза на пружине увеличить в 4 раза, период малых колебаний…",
    options: [
      { id: "a", text: "увеличится в 4 раза" },
      { id: "b", text: "увеличится в 2 раза" },
      { id: "c", text: "уменьшится в 2 раза" },
      { id: "d", text: "не изменится" },
    ],
    correctOptionId: "b",
    explanation: "T ∼ √m, поэтому при m→4m период растёт в 2 раза.",
  },
  {
    id: "p_mkt_2",
    sectionId: "mkt",
    topicId: "ideal_gas",
    difficulty: "medium",
    prompt:
      "При изохорическом нагревании идеального газа давление выросло в 1,5 раза. Абсолютная температура…",
    options: [
      { id: "a", text: "не изменилась" },
      { id: "b", text: "выросла в 1,5 раза" },
      { id: "c", text: "выросла в 2,25 раза" },
      { id: "d", text: "уменьшилась в 1,5 раза" },
    ],
    correctOptionId: "b",
    explanation: "При V = const из p/T = const следует T₂/T₁ = p₂/p₁ = 1,5.",
  },
  {
    id: "p_th_2",
    sectionId: "thermo",
    topicId: "first_law",
    difficulty: "easy",
    prompt: "При адиабатическом процессе количество теплоты Q равно…",
    options: [
      { id: "a", text: "работе газа" },
      { id: "b", text: "изменению внутренней энергии" },
      { id: "c", text: "нулю" },
      { id: "d", text: "pΔV" },
    ],
    correctOptionId: "c",
    explanation: "Адиабата: Q = 0, поэтому ΔU = −A.",
  },
  {
    id: "p_mag_2",
    sectionId: "magnetism",
    topicId: "ampere",
    difficulty: "easy",
    prompt:
      "Сила Ампера максимальна, когда угол между током и магнитным полем равен…",
    options: [
      { id: "a", text: "0°" },
      { id: "b", text: "45°" },
      { id: "c", text: "90°" },
      { id: "d", text: "180°" },
    ],
    correctOptionId: "c",
    explanation: "F = I l B sinα, sinα = 1 при α = 90°.",
  },
  {
    id: "p_ind_2",
    sectionId: "induction",
    topicId: "faraday",
    difficulty: "hard",
    prompt:
      "В однородном поле B = 0,5 Тл рамка площадью 0,04 м² повернулась так, что поток стал равен нулю за 0,1 с. Модуль средней ЭДС…",
    options: [
      { id: "a", text: "0,02 В" },
      { id: "b", text: "0,2 В" },
      { id: "c", text: "2 В" },
      { id: "d", text: "20 В" },
    ],
    correctOptionId: "b",
    explanation: "|ℰ| = |ΔΦ|/Δt = B S / Δt = 0,5·0,04/0,1 = 0,2 В.",
  },
  {
    id: "p_cur_3",
    sectionId: "current",
    topicId: "ohm",
    difficulty: "hard",
    prompt:
      "Два резистора 6 Ом и 3 Ом соединены параллельно. Эквивалентное сопротивление равно…",
    options: [
      { id: "a", text: "2 Ом" },
      { id: "b", text: "3 Ом" },
      { id: "c", text: "4,5 Ом" },
      { id: "d", text: "9 Ом" },
    ],
    correctOptionId: "a",
    explanation: "1/R = 1/6 + 1/3 = 1/2 ⇒ R = 2 Ом.",
  },
  {
    id: "p_cons_3",
    sectionId: "conservation",
    topicId: "energy",
    difficulty: "hard",
    prompt:
      "Камень бросили вверх со скоростью 20 м/с (g = 10 м/с², сопротивление воздуха нет). Высота подъёма равна…",
    options: [
      { id: "a", text: "10 м" },
      { id: "b", text: "15 м" },
      { id: "c", text: "20 м" },
      { id: "d", text: "40 м" },
    ],
    correctOptionId: "c",
    explanation: "mgh = mv²/2 ⇒ h = v²/(2g) = 400/20 = 20 м.",
  },
];

export function filterTourProblems(input: {
  sectionId: string;
  topicId: string | "all";
  difficulty: TourProblemDifficulty | "any";
  limit: number;
}): TourProblem[] {
  const pool = TOUR_PROBLEMS.filter((p) => {
    if (p.sectionId !== input.sectionId) return false;
    if (input.topicId !== "all" && p.topicId !== input.topicId) return false;
    if (input.difficulty !== "any" && p.difficulty !== input.difficulty) {
      return false;
    }
    return true;
  });
  const shuffled = [...pool].sort((a, b) => a.id.localeCompare(b.id));
  return shuffled.slice(0, Math.max(1, input.limit));
}
