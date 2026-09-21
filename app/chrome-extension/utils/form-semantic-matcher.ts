/**
 * Semantic Field & Choice Matcher for Form Pipeline
 *
 * Provides hybrid semantic matching with three cascading tiers:
 * 1. TypeSafe Jev System One Choice inference (via Native Host bridge)
 * 2. Deterministic Semantic Heuristic Engine (synonyms dictionary, token overlap, CJK bigrams)
 * 3. Literal string / substring fallback
 */

import { sendJevMatchToNative } from '../entrypoints/background/native-host';

export interface MatchCandidate {
  id: string | number;
  text: string;
  details?: string;
}

export interface MatchResult {
  matchedId: string | number;
  confidence: number;
  engine: 'jev' | 'heuristic' | 'literal';
}

const FIELD_SYNONYMS: Record<string, string[]> = {
  phone: ['phone', 'mobile', 'tel', 'telephone', 'cell', '手机', '手机号', '电话', '联系方式', '联系电话'],
  email: ['email', 'e-mail', 'mail', '邮箱', '电子邮箱', '邮件'],
  name: ['name', 'username', 'user', 'realname', 'fullname', '姓名', '用户名', '名称', '姓名/称呼', '昵称'],
  firstname: ['firstname', 'first-name', 'givenname', '名'],
  lastname: ['lastname', 'last-name', 'surname', 'familyname', '姓'],
  gender: ['gender', 'sex', '性别'],
  company: ['company', 'organization', 'org', 'enterprise', 'employer', '公司', '企业', '单位', '组织', '机构'],
  address: ['address', 'addr', 'location', 'street', '地址', '住址', '所在地', '街道'],
  city: ['city', '城市', '市'],
  country: ['country', 'nation', 'region', '国家', '地区'],
  password: ['password', 'passwd', 'pwd', '密码'],
  age: ['age', '年龄'],
  title: ['title', 'job', 'position', 'role', '职位', '头衔', '职务', '岗位'],
  search: ['search', 'query', 'find', '搜索', '查询', '查找'],
  female: ['female', 'woman', 'girl', 'ms', 'mrs', 'lady', '女', '女士', '女性'],
  male: ['male', 'man', 'boy', 'mr', 'gentleman', '男', '男士', '男性'],
  yes: ['yes', 'true', 'ok', 'agree', 'accept', '是', '确认', '同意', '接受', '正确'],
  no: ['no', 'false', 'cancel', 'reject', 'deny', '否', '取消', '拒绝', '不同意', '错误'],
  submit: ['submit', 'send', 'done', 'finish', 'complete', '提交', '发送', '完成', '确认提交'],
  next: ['next', 'continue', 'proceed', 'forward', '下一步', '继续'],
};

/**
 * Tokenizes text into lowercase alphanumeric words and CJK character bigrams
 */
export function tokenizeText(text: string): string[] {
  if (!text) return [];
  const normalized = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const rawWords = normalized.split(/\s+/).filter(Boolean);
  const tokens: string[] = [];

  for (const word of rawWords) {
    const segments = word.match(
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+|[\p{L}\p{N}_-]+/gu,
    );
    if (!segments) continue;
    for (const seg of segments) {
      const cjkChars = seg.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu);
      if (cjkChars && cjkChars.length >= 2 && cjkChars.length === seg.length) {
        for (let i = 0; i < cjkChars.length - 1; i++) {
          tokens.push(cjkChars[i] + cjkChars[i + 1]);
        }
      } else {
        tokens.push(seg.toLowerCase());
      }
    }
  }
  return tokens.length > 0 ? tokens : rawWords;
}

/**
 * Identifies the semantic synonym category for a given term
 */
function findSynonymCategory(term: string): string | null {
  const norm = term.toLowerCase().trim();
  const tokens = tokenizeText(norm);
  for (const [category, synonyms] of Object.entries(FIELD_SYNONYMS)) {
    if (category === norm || synonyms.includes(norm)) {
      return category;
    }
    for (const syn of synonyms) {
      if (syn.length >= 2 && tokens.includes(syn)) {
        return category;
      }
    }
  }
  return null;
}

/**
 * Deterministic heuristic scoring between a query and a candidate
 */
export function scoreCandidate(query: string, candidateText: string): number {
  if (!query || !candidateText) return 0;
  const normQuery = query.toLowerCase().trim();
  const normCand = candidateText.toLowerCase().trim();

  // 1. Exact match
  if (normQuery === normCand) return 1.0;

  // 2. Exact token / whole-word match (avoids raw substring bleed like "no" in "number", "city" in "electricity", "male" in "female")
  const queryTokens = tokenizeText(normQuery);
  const candTokens = tokenizeText(normCand);
  if (candTokens.includes(normQuery) || queryTokens.includes(normCand)) {
    return 0.95;
  }

  // 3. Synonym category alignment
  const queryCat = findSynonymCategory(normQuery);
  const candCat = findSynonymCategory(normCand);
  if (queryCat && candCat && queryCat === candCat) {
    return 0.9;
  }

  // 4. Token & CJK bigram overlap with symmetric Jaccard similarity
  if (queryTokens.length > 0 && candTokens.length > 0) {
    let intersection = 0;
    for (const qt of queryTokens) {
      if (candTokens.includes(qt)) {
        intersection++;
      }
    }
    const union = queryTokens.length + candTokens.length - intersection;
    const jaccard = intersection / Math.max(1, union);
    const overlapRatio = intersection / Math.max(queryTokens.length, candTokens.length);
    const combinedScore = Math.max(jaccard, overlapRatio) * 0.75;
    if (combinedScore > 0.3) {
      return combinedScore;
    }
  }

  return 0;
}

/**
 * Evaluates semantic match using local heuristic rules
 */
export function heuristicSemanticMatch(
  query: string,
  candidates: MatchCandidate[],
  threshold = 0.4,
): MatchResult | null {
  let bestCandidate: MatchCandidate | null = null;
  let bestScore = 0;

  for (const cand of candidates) {
    const combinedText = `${cand.text} ${cand.details || ''}`.trim();
    const score = scoreCandidate(query, combinedText);
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = cand;
    }
  }

  if (bestCandidate && bestScore >= threshold) {
    return {
      matchedId: bestCandidate.id,
      confidence: bestScore,
      engine: 'heuristic',
    };
  }

  return null;
}

/**
 * Hybrid Semantic Matcher
 * Calls Jev System One via Native Host when connected; falls back gracefully to
 * Heuristic semantic matching, and finally to literal string matching.
 */
export async function matchSemantically(
  type: 'field' | 'choice' | 'input',
  query: string,
  candidates: MatchCandidate[],
  value?: string,
  context?: string,
): Promise<MatchResult | null> {
  if (candidates.length === 0) return null;

  // Tier 1: Try literal exact match first (instant, 0 RTT, zero false positives)
  const normQuery = (type === 'choice' && value ? value : query).toLowerCase().trim();
  if (normQuery) {
    // 1a. Prioritize exact string match across all candidates
    const exactMatch = candidates.find(
      (c) => (c.text || '').toLowerCase().trim() === normQuery,
    );
    if (exactMatch) {
      return {
        matchedId: exactMatch.id,
        confidence: 1.0,
        engine: 'literal',
      };
    }

    // 1b. Check exact whole-token match across candidates (e.g. query "phone" matching candidate "Mobile Phone")
    const wholeTokenMatch = candidates.find((c) => {
      const tokens = tokenizeText(c.text || '');
      return tokens.includes(normQuery);
    });
    if (wholeTokenMatch) {
      return {
        matchedId: wholeTokenMatch.id,
        confidence: 0.95,
        engine: 'literal',
      };
    }
  }

  // Tier 2: Try Jev System One through Native Host
  try {
    const jevRes = await sendJevMatchToNative({
      type,
      query,
      value,
      context,
      candidates,
    });
    if (jevRes && jevRes.success && jevRes.matchedId !== undefined && (jevRes.confidence ?? 0) >= 0.3) {
      return {
        matchedId: jevRes.matchedId,
        confidence: jevRes.confidence || 0.85,
        engine: 'jev',
      };
    }
  } catch (err) {
    console.warn('[FormSemanticMatcher] Jev native query failed, falling back to heuristic:', err);
  }

  // Tier 3: Heuristic semantic matching with synonyms & CJK tokenization
  const heuristic = heuristicSemanticMatch(normQuery, candidates);
  if (heuristic) {
    return heuristic;
  }

  return null;
}
