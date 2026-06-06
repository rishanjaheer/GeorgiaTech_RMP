const SCHOOL_ID = "U2Nob29sLTM2MQ==";
const RMP_GRAPHQL_URL = "https://www.ratemyprofessors.com/graphql";
const CACHE_KEY = "rmpCache";
const LOG_PREFIX = "[RMP GT]";

const GRAPHQL_QUERY = `query NewSearchTeachersQuery($query: TeacherSearchQuery!) {
  newSearch {
    teachers(query: $query, first: 1) {
      edges {
        node {
          id
          legacyId
          firstName
          lastName
          avgRating
          avgDifficulty
          numRatings
          wouldTakeAgainPercent
          department
        }
      }
    }
  }
}`;

async function getCache() {
  const result = await chrome.storage.session.get({ [CACHE_KEY]: {} });
  return result[CACHE_KEY] || {};
}

async function setCacheEntry(key, value) {
  const cache = await getCache();
  cache[key] = { ...value, timestamp: Date.now() };
  await chrome.storage.session.set({ [CACHE_KEY]: cache });
}

async function fetchProfessor(queryText) {
  const response = await fetch(RMP_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic dGVzdDp0ZXN0",
    },
    body: JSON.stringify({
      query: GRAPHQL_QUERY,
      variables: {
        query: {
          text: queryText,
          schoolID: SCHOOL_ID,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`RMP API returned ${response.status}`);
  }

  const data = await response.json();
  const edges = data?.data?.newSearch?.teachers?.edges;

  if (!edges || edges.length === 0) {
    return { found: false };
  }

  const node = edges[0].node;
  return {
    found: true,
    rating: node.avgRating,
    difficulty: node.avgDifficulty,
    numRatings: node.numRatings,
    wouldTakeAgain: node.wouldTakeAgainPercent,
    legacyId: node.legacyId,
    firstName: node.firstName,
    lastName: node.lastName,
    department: node.department,
  };
}

async function getProfessorData(cacheKey, queryText) {
  const cache = await getCache();

  if (Object.prototype.hasOwnProperty.call(cache, cacheKey)) {
    console.log(LOG_PREFIX, "Cache hit:", cacheKey);
    return { ok: true, data: cache[cacheKey], fromCache: true };
  }

  console.log(LOG_PREFIX, "API call:", queryText);
  const data = await fetchProfessor(queryText);
  await setCacheEntry(cacheKey, data);
  return { ok: true, data, fromCache: false };
}

chrome.runtime.onInstalled.addListener(() => {
  console.log(LOG_PREFIX, "Extension installed.");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "GET_PROFESSOR") return;

  getProfessorData(message.cacheKey, message.queryText)
    .then((result) => sendResponse(result))
    .catch((err) => sendResponse({ ok: false, error: err.message }));

  return true;
});
