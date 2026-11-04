/** Public exercise-guide API used for coaching text and demo-video URLs. */
const EXERCISE_API_BASE = 'https://free-exercise-db-api.vercel.app/api/v1';
const demoRequests = new Map<string, Promise<ExerciseDemo | null>>();

export type ExerciseDemo = {
  id: string;
  name: string;
  description?: string;
  instructions: string[];
  formCues: string[];
  commonMistakes: string[];
  breathing?: string;
  videos: { male?: string; female?: string };
  thumbnails: { male?: string; female?: string };
};

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return typeof value === 'string' ? [value] : [];
}

async function fetchExerciseDemo(name: string): Promise<ExerciseDemo | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    // The provider documents /search?q= for name and alias search. The
    // exercises?search= endpoint can return unrelated records for some names.
    const url = `${EXERCISE_API_BASE}/search?q=${encodeURIComponent(name)}`;
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Exercise guide API returned ${response.status}`);
    const body = await response.json();
    const exercises = Array.isArray(body?.data) ? body.data
      : Array.isArray(body?.results) ? body.results
      : Array.isArray(body?.exercises) ? body.exercises : [];
    const target = normalize(name);
    const tokens = target.split(' ').filter((part) => part.length > 1);
    const result = exercises.find((item: any) => {
      const aliases = asStringList(item?.aliases).map(normalize);
      const itemName = normalize(String(item?.name || ''));
      return itemName === target || aliases.includes(target);
    }) || exercises
      .map((item: any) => {
        const searchable = [String(item?.name || ''), ...asStringList(item?.aliases)].join(' ');
        const itemTokens = new Set(normalize(searchable).split(' '));
        const score = tokens.length ? tokens.filter((token) => itemTokens.has(token)).length / tokens.length : 0;
        return { item, score };
      })
      .filter(({ score }: { score: number }) => score >= 0.6)
      .sort((a: any, b: any) => b.score - a.score)[0]?.item;
    if (!result) return null;

    const steps = asStringList(result.steps);
    const instructions = steps.length ? steps : asStringList(result.instructions);
    return {
      id: String(result.id || ''),
      name: String(result.name || name),
      description: typeof result.shortDescription === 'string' ? result.shortDescription : undefined,
      instructions,
      formCues: Array.isArray(result.formCues) ? result.formCues : [],
      commonMistakes: Array.isArray(result.commonMistakes) ? result.commonMistakes : [],
      breathing: typeof result.breathing === 'string' ? result.breathing : undefined,
      videos: result.videos && typeof result.videos === 'object' ? result.videos : {},
      thumbnails: result.thumbnails && typeof result.thumbnails === 'object' ? result.thumbnails : {},
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function findExerciseDemo(name: string): Promise<ExerciseDemo | null> {
  const key = normalize(name);
  let request = demoRequests.get(key);
  if (!request) {
    request = fetchExerciseDemo(name).catch((error) => {
      // Don't cache temporary errors; allow the user to retry later.
      demoRequests.delete(key);
      throw error;
    });
    demoRequests.set(key, request);
  }
  return request;
}
