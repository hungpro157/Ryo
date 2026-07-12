export function toRepresentativeQuote(comment, topic) {
  return {
    text: comment.originalText,
    author: comment.author,
    likeCount: comment.likeCount,
    replyCount: comment.replyCount,
    topic,
    qualityScore: comment.qualityScore,
    relevanceScore: comment.relevanceScore,
  };
}

export function selectRepresentativeQuotes(comments, topic, limit) {
  return [...comments]
    .sort((left, right) => (
      (right.relevanceScore + right.qualityScore) - (left.relevanceScore + left.qualityScore)
    ))
    .slice(0, limit)
    .map((comment) => toRepresentativeQuote(comment, topic));
}
