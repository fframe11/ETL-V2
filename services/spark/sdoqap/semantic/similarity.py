"""Hybrid string similarity used by semantic standardization: substring containment
(weight 0.4) + token overlap, falling back to character-bigram overlap for Thai
run-together words (0.3) + character-bigram cosine (0.3)."""


def char_ngrams(s, n=2):
    s = str(s).lower().strip()
    return [s[i:i+n] for i in range(len(s)-n+1)]


def ngram_cosine(s1, s2):
    ngrams1 = char_ngrams(s1)
    ngrams2 = char_ngrams(s2)
    if not ngrams1 or not ngrams2:
        return 0.0

    bag1 = {}
    for ng in ngrams1:
        bag1[ng] = bag1.get(ng, 0) + 1

    bag2 = {}
    for ng in ngrams2:
        bag2[ng] = bag2.get(ng, 0) + 1

    all_ngrams = set(bag1.keys()).union(set(bag2.keys()))
    dot = sum(bag1.get(ng, 0) * bag2.get(ng, 0) for ng in all_ngrams)
    norm1 = sum(v**2 for v in bag1.values())**0.5
    norm2 = sum(v**2 for v in bag2.values())**0.5

    if norm1 == 0 or norm2 == 0:
        return 0.0
    return dot / (norm1 * norm2)


def hybrid_similarity(s1, s2):
    s1_clean = str(s1).lower().strip()
    s2_clean = str(s2).lower().strip()

    if s1_clean == s2_clean:
        return 1.0

    # 1. Substring component (containment check)
    sub_score = 0.0
    if s2_clean in s1_clean or s1_clean in s2_clean:
        sub_score = 1.0

    # 2. Token Overlap component
    overlap = 0.0
    tokens1 = set(s1_clean.split())
    tokens2 = set(s2_clean.split())
    if tokens1 and tokens2:
        intersection = tokens1.intersection(tokens2)
        overlap = len(intersection) / min(len(tokens1), len(tokens2))

    # 3. N-gram Cosine component
    ngram = ngram_cosine(s1_clean, s2_clean)

    # If token overlap is 0 (like in Thai run-together words), fallback to n-gram overlap
    if overlap == 0.0:
        ng1 = char_ngrams(s1_clean)
        ng2 = char_ngrams(s2_clean)
        if ng1 and ng2:
            overlap = len(set(ng1).intersection(set(ng2))) / min(len(set(ng1)), len(set(ng2)))

    final_score = (sub_score * 0.4) + (overlap * 0.3) + (ngram * 0.3)
    if final_score >= 0.95:
        return 1.0

    return final_score
