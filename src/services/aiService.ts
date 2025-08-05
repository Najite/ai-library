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

// Optimized model list - fastest models first
const OPTIMIZED_MODELS = [
  'meta-llama/llama-3.2-3b-instruct:free', // Generally fastest
  'microsoft/phi-3-mini-128k-instruct:free', // Good speed/quality balance
  'google/gemma-2-9b-it:free' // Backup option
  // Removed slower models from the list
];

// Pre-compiled regex for better performance
const JSON_EXTRACT_REGEX = /```(?:json)?\s*([\s\S]*?)\s*```/;

// Optimized JSON extraction
const extractJsonFromResponse = (content: string): any => {
  const jsonMatch = content.match(JSON_EXTRACT_REGEX);
  const jsonString = jsonMatch ? jsonMatch[1] : content;
  return JSON.parse(jsonString.trim());
};

// Concurrent model testing with early return
const tryModelsWithTimeout = async (query: string, timeoutMs: number = 8000): Promise<AIRecommendation> => {
  const promises = OPTIMIZED_MODELS.map(async (model, index) => {
    // Add small delay for lower priority models to avoid unnecessary requests
    if (index > 0) {
      await new Promise(resolve => setTimeout(resolve, index * 500));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      console.log(`Trying model: ${model}`);
      
      const response = await axios.post(
        AI_API_BASE_URL,
        {
          model: model,
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
        console.log(`Success with model: ${model}`);
        return { result, model };
      }
    } catch (error) {
      clearTimeout(timeoutId);
      console.error(`Model ${model} failed:`, error.message);
      throw error;
    }
  });

  // Use Promise.any to return the first successful response
  try {
    const { result } = await Promise.any(promises);
    return result;
  } catch (error) {
    throw new Error('All models failed');
  }
};

// Main function with caching and optimization
export const getAIRecommendations = async (query: string): Promise<AIRecommendation> => {
  // Normalize query for caching
  const normalizedQuery = query.toLowerCase().trim();
  
  // Check cache first
  const cached = recommendationCache.get(normalizedQuery);
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    console.log('Returning cached result');
    return cached.data;
  }

  try {
    // Try optimized concurrent approach
    const result = await tryModelsWithTimeout(query, 6000); // 6 second timeout
    
    // Cache the result
    recommendationCache.set(normalizedQuery, {
      data: result,
      timestamp: Date.now()
    });
    
    return result;
  } catch (error) {
    console.log('Concurrent approach failed, using fallback');
    
    // Enhanced fallback with query-specific recommendations
    const fallbackRecommendations = getFallbackRecommendations(query);
    
    return {
      enhancedQuery: query,
      recommendations: fallbackRecommendations,
      searchTerms: generateSearchTerms(query)
    };
  }
};

// Smart fallback recommendations based on query analysis
const getFallbackRecommendations = (query: string): string[] => {
  const lowerQuery = query.toLowerCase();
  
  // Emotion-based recommendations
  if (lowerQuery.includes('sad') || lowerQuery.includes('depressed') || lowerQuery.includes('down')) {
    return [
      "The Midnight Library by Matt Haig",
      "Reasons to Stay Alive by Matt Haig",
      "The Book of Joy by Dalai Lama and Desmond Tutu"
    ];
  }
  
  if (lowerQuery.includes('anxious') || lowerQuery.includes('worry') || lowerQuery.includes('stress')) {
    return [
      "The Anxiety and Phobia Workbook by Edmund Bourne",
      "Dare by Barry McDonagh",
      "The Power of Now by Eckhart Tolle"
    ];
  }
  
  if (lowerQuery.includes('motivation') || lowerQuery.includes('inspiration') || lowerQuery.includes('lost')) {
    return [
      "Atomic Habits by James Clear",
      "The 7 Habits of Highly Effective People by Stephen Covey",
      "Man's Search for Meaning by Viktor Frankl"
    ];
  }
  
  if (lowerQuery.includes('romance') || lowerQuery.includes('love')) {
    return [
      "Pride and Prejudice by Jane Austen",
      "The Seven Husbands of Evelyn Hugo by Taylor Jenkins Reid",
      "Me Before You by Jojo Moyes"
    ];
  }
  
  if (lowerQuery.includes('fantasy') || lowerQuery.includes('magic')) {
    return [
      "The Name of the Wind by Patrick Rothfuss",
      "The Way of Kings by Brandon Sanderson",
      "The Hobbit by J.R.R. Tolkien"
    ];
  }
  
  // Default recommendations
  return [
    "The Alchemist by Paulo Coelho",
    "Educated by Tara Westover",
    "The Seven Habits of Highly Effective People by Stephen Covey"
  ];
};

// Generate relevant search terms based on query
const generateSearchTerms = (query: string): string[] => {
  const lowerQuery = query.toLowerCase();
  const baseTerms = [query];
  
  // Add contextual search terms
  if (lowerQuery.includes('sad') || lowerQuery.includes('depressed')) {
    baseTerms.push('uplifting books', 'mental health', 'hope');
  } else if (lowerQuery.includes('motivation')) {
    baseTerms.push('self-help', 'personal development', 'success');
  } else if (lowerQuery.includes('romance')) {
    baseTerms.push('contemporary romance', 'love stories', 'romantic fiction');
  } else if (lowerQuery.includes('fantasy')) {
    baseTerms.push('epic fantasy', 'sword and sorcery', 'magical realism');
  } else {
    baseTerms.push('popular fiction', 'bestsellers', 'award winners');
  }
  
  return baseTerms.slice(0, 3); // Limit to 3 terms
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