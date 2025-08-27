import axios from 'axios';

const AI_API_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
const AI_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;

export interface AIRecommendation {
  enhancedQuery: string;
  recommendations: string[];
  searchTerms: string[];
}

// Cache for storing recent recommendations (in-memory for session)
const recommendationCache = new Map<string, { data: AIRecommendation; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Single model to use - fastest and most reliable
const MODEL = 'meta-llama/llama-4-maverick:free';

// Pre-compiled regex for better performance
const JSON_EXTRACT_REGEX = /```(?:json)?\s*([\s\S]*?)\s*```/;

// Optimized JSON extraction
const extractJsonFromResponse = (content: string): any => {
  const jsonMatch = content.match(JSON_EXTRACT_REGEX);
  const jsonString = jsonMatch ? jsonMatch[1] : content;
  return JSON.parse(jsonString.trim());
};

// Single model request with timeout
const getRecommendationsFromModel = async (query: string, timeoutMs: number = 8000): Promise<AIRecommendation> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    console.log(`Using model: ${MODEL}`);
    
    const response = await axios.post(
      AI_API_BASE_URL,
      {
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a librarian assistant. Given a search query, provide book recommendations. Respond with valid JSON only: {"enhancedQuery": "improved search query", "recommendations": ["Book Title by Author", "Book Title by Author", "Book Title by Author"], "searchTerms": ["term1", "term2", "term3"]}'
          },
          {
            role: 'user',
            content: `Recommend books for: "${query}"`
          }
        ],
        temperature: 0.3, // Lower temperature for faster, more consistent responses
        max_tokens: 200, // Reduced token limit for speed
        top_p: 0.9, // Add top_p for better performance
      },
      {
        headers: {
          'Authorization': `Bearer ${AI_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'localhost',
          'X-Title': 'Book Recommendation App'
        },
        timeout: timeoutMs,
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);
    
    const content = response.data.choices[0]?.message?.content;
    if (content) {
      const result = extractJsonFromResponse(content);
      console.log(`Success with model: ${MODEL}`);
      return result;
    } else {
      throw new Error('No content received from model');
    }
  } catch (error) {
    clearTimeout(timeoutId);
    console.error(`Model ${MODEL} failed:`, error.message);
    throw error;
  }
};

// Main function with caching
export const getAIRecommendations = async (query: string): Promise<AIRecommendation> => {
  // Normalize query for caching
  const normalizedQuery = query.toLowerCase().trim();
  
  // Check cache first
  const cached = recommendationCache.get(normalizedQuery);
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    console.log('Returning cached result');
    return cached.data;
  }

  // Get recommendations from the single model
  const result = await getRecommendationsFromModel(query, 8000); // 8 second timeout
  
  // Cache the result
  recommendationCache.set(normalizedQuery, {
    data: result,
    timestamp: Date.now()
  });
  
  return result;
};

// Cleanup function to prevent memory leaks
export const clearRecommendationCache = (): void => {
  recommendationCache.clear();
};

// Optional: Auto-cleanup old cache entries
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of recommendationCache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      recommendationCache.delete(key);
    }
  }
}, CACHE_DURATION);