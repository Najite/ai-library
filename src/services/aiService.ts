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
              content: 'You are an academic librarian specializing in scholarly literature. Given a search query, provide ONLY academic book recommendations including textbooks, research monographs, scholarly publications, and peer-reviewed academic works. Do NOT recommend popular fiction, self-help, or general interest books. Focus on books published by academic presses, used in university courses, or written by scholars for academic audiences. Respond with valid JSON only: {"enhancedQuery": "improved academic search query", "recommendations": ["Academic Book Title by Scholar/Author (Publisher, Year)", "Academic Book Title by Scholar/Author (Publisher, Year)", "Academic Book Title by Scholar/Author (Publisher, Year)"], "searchTerms": ["academic_term1", "scholarly_term2", "research_term3"]}'
            },
            {
              role: 'user',
              content: `Recommend academic books and scholarly works for: "${query}"`
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
            'X-Title': 'Academic Book Recommendation App'
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

// Academic fallback recommendations based on query analysis
const getAcademicFallbackRecommendations = (query: string): string[] => {
  const lowerQuery = query.toLowerCase();
  
  // Psychology and Mental Health
  if (lowerQuery.includes('psychology') || lowerQuery.includes('mental health') || lowerQuery.includes('cognitive')) {
    return [
      "Cognitive Psychology by Robert J. Sternberg (Cengage, 2017)",
      "The Handbook of Social Psychology by Susan Fiske (Wiley, 2010)",
      "Abnormal Psychology by Ronald Comer (Worth Publishers, 2019)"
    ];
  }
  
  // Computer Science and Technology
  if (lowerQuery.includes('computer') || lowerQuery.includes('programming') || lowerQuery.includes('algorithm')) {
    return [
      "Introduction to Algorithms by Thomas Cormen (MIT Press, 2009)",
      "Computer Networks by Andrew Tanenbaum (Pearson, 2021)",
      "Artificial Intelligence: A Modern Approach by Stuart Russell (Pearson, 2020)"
    ];
  }
  
  // Business and Economics
  if (lowerQuery.includes('business') || lowerQuery.includes('economics') || lowerQuery.includes('finance')) {
    return [
      "Principles of Economics by N. Gregory Mankiw (Cengage, 2020)",
      "Strategic Management by Fred David (Pearson, 2019)",
      "Corporate Finance by Ross, Westerfield & Jaffe (McGraw-Hill, 2018)"
    ];
  }
  
  // History and Political Science
  if (lowerQuery.includes('history') || lowerQuery.includes('politics') || lowerQuery.includes('government')) {
    return [
      "A History of Modern Political Thought by Iain Hampsher-Monk (Blackwell, 1992)",
      "The Oxford History of the World edited by J.M. Roberts (Oxford, 2013)",
      "Comparative Politics by Gabriel Almond (Pearson, 2015)"
    ];
  }
  
  // Literature and English Studies
  if (lowerQuery.includes('literature') || lowerQuery.includes('english') || lowerQuery.includes('writing')) {
    return [
      "The Norton Anthology of English Literature edited by Stephen Greenblatt (Norton, 2018)",
      "Literary Theory: An Introduction by Terry Eagleton (University of Minnesota Press, 2008)",
      "The Craft of Research by Wayne Booth (University of Chicago Press, 2016)"
    ];
  }
  
  // Science (General)
  if (lowerQuery.includes('science') || lowerQuery.includes('research') || lowerQuery.includes('method')) {
    return [
      "The Structure of Scientific Revolutions by Thomas Kuhn (University of Chicago Press, 1996)",
      "Research Design: Qualitative, Quantitative, and Mixed Methods by John Creswell (SAGE, 2017)",
      "Introduction to Scientific Research Methods in Geography by Basil Gomez (Wiley, 2019)"
    ];
  }
  
  // Philosophy
  if (lowerQuery.includes('philosophy') || lowerQuery.includes('ethics') || lowerQuery.includes('logic')) {
    return [
      "The Problems of Philosophy by Bertrand Russell (Oxford, 1997)",
      "Nicomachean Ethics by Aristotle, translated by Terence Irwin (Hackett, 2019)",
      "A Concise Introduction to Logic by Patrick Hurley (Cengage, 2016)"
    ];
  }
  
  // Mathematics
  if (lowerQuery.includes('math') || lowerQuery.includes('statistics') || lowerQuery.includes('calculus')) {
    return [
      "Calculus: Early Transcendentals by James Stewart (Cengage, 2020)",
      "Introduction to Mathematical Statistics by Robert Hogg (Pearson, 2019)",
      "Linear Algebra and Its Applications by David Lay (Pearson, 2015)"
    ];
  }
  
  // Default academic recommendations (interdisciplinary)
  return [
    "The Craft of Research by Wayne Booth (University of Chicago Press, 2016)",
    "A Manual for Writers by Kate Turabian (University of Chicago Press, 2018)",
    "The Academic Life by Steven Brint (Cambridge University Press, 2019)"
  ];
};

// Generate academic search terms based on query
const generateAcademicSearchTerms = (query: string): string[] => {
  const lowerQuery = query.toLowerCase();
  const baseTerms = [query];
  
  // Add academic contextual search terms
  if (lowerQuery.includes('psychology')) {
    baseTerms.push('psychological research', 'cognitive science', 'behavioral studies');
  } else if (lowerQuery.includes('computer') || lowerQuery.includes('programming')) {
    baseTerms.push('computer science textbooks', 'software engineering', 'algorithms and data structures');
  } else if (lowerQuery.includes('business') || lowerQuery.includes('economics')) {
    baseTerms.push('business administration', 'economic theory', 'management studies');
  } else if (lowerQuery.includes('history')) {
    baseTerms.push('historical analysis', 'historiography', 'historical research methods');
  } else if (lowerQuery.includes('literature') || lowerQuery.includes('english')) {
    baseTerms.push('literary criticism', 'comparative literature', 'rhetoric and composition');
  } else if (lowerQuery.includes('philosophy')) {
    baseTerms.push('philosophical inquiry', 'ethics and moral philosophy', 'logic and reasoning');
  } else if (lowerQuery.includes('science')) {
    baseTerms.push('scientific methodology', 'research methods', 'peer-reviewed studies');
  } else if (lowerQuery.includes('math')) {
    baseTerms.push('mathematical analysis', 'applied mathematics', 'statistical methods');
  } else {
    baseTerms.push('academic textbooks', 'scholarly publications', 'university press');
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
