import asyncio
import json
import logging
import os
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple

import numpy as np
from langchain_community.vectorstores import Chroma, FAISS
from langchain_openai import OpenAIEmbeddings
from langchain.memory import ConversationBufferWindowMemory, ConversationSummaryBufferMemory
from langchain.schema import Document, BaseMessage, HumanMessage, AIMessage
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.retrievers import ContextualCompressionRetriever
from langchain.retrievers.document_compressors import LLMChainExtractor

logger = logging.getLogger(__name__)

class MemoryType:
    SHORT_TERM = "short_term"
    LONG_TERM = "long_term"
    SEMANTIC = "semantic"
    EPISODIC = "episodic"

class MemoryManager:
    """Advanced memory management for CrewAI agents with vector storage and context retrieval"""
    
    def __init__(self):
        self.embeddings = None
        self.vector_stores = {}
        self.conversation_memories = {}
        self.user_profiles = {}
        self.semantic_cache = {}
        
        # Vector storage configurations
        self.collections = {
            "user_resumes": "Resume data and analysis results",
            "job_descriptions": "Job postings and requirements",
            "market_intelligence": "Market trends and salary data",
            "user_interactions": "Conversation history and preferences",
            "company_research": "Company information and culture data"
        }
        
        # Memory retention policies
        self.retention_policies = {
            MemoryType.SHORT_TERM: timedelta(hours=24),
            MemoryType.LONG_TERM: timedelta(days=365),
            MemoryType.SEMANTIC: timedelta(days=90),
            MemoryType.EPISODIC: timedelta(days=30)
        }
        
    async def initialize(self):
        """Initialize memory management system"""
        try:
            # Initialize embeddings
            await self._initialize_embeddings()
            
            # Initialize vector stores for different data types
            await self._initialize_vector_stores()
            
            # Load existing user profiles
            await self._load_user_profiles()
            
            logger.info("Memory management system initialized")
            
        except Exception as e:
            logger.error(f"Memory manager initialization failed: {e}")
            raise
    
    async def _initialize_embeddings(self):
        """Initialize embedding model"""
        try:
            if os.getenv("OPENAI_API_KEY"):
                self.embeddings = OpenAIEmbeddings(
                    model="text-embedding-ada-002",
                    chunk_size=1000
                )
                logger.info("OpenAI embeddings initialized")
            else:
                logger.warning("No OpenAI key - using local embeddings fallback")
                # Could add HuggingFace embeddings as fallback
                
        except Exception as e:
            logger.error(f"Embeddings initialization failed: {e}")
            raise
    
    async def _initialize_vector_stores(self):
        """Initialize vector stores for different data collections"""
        try:
            if not self.embeddings:
                logger.warning("No embeddings available - vector storage disabled")
                return
            
            for collection_name, description in self.collections.items():
                # Use Chroma for persistent storage
                vector_store = Chroma(
                    collection_name=collection_name,
                    embedding_function=self.embeddings,
                    persist_directory=f"./vector_db/{collection_name}"
                )
                self.vector_stores[collection_name] = vector_store
                logger.info(f"Initialized vector store: {collection_name}")
                
        except Exception as e:
            logger.error(f"Vector store initialization failed: {e}")
    
    async def _load_user_profiles(self):
        """Load existing user profiles from storage"""
        try:
            # In production, this would load from database
            profile_file = "./data/user_profiles.json"
            if os.path.exists(profile_file):
                with open(profile_file, 'r') as f:
                    self.user_profiles = json.load(f)
                logger.info(f"Loaded {len(self.user_profiles)} user profiles")
        except Exception as e:
            logger.warning(f"Failed to load user profiles: {e}")
    
    async def store_resume_data(self, user_id: str, resume_text: str, 
                              analysis_result: Dict[str, Any]) -> str:
        """Store resume and analysis in vector storage"""
        try:
            if "user_resumes" not in self.vector_stores:
                logger.warning("Resume vector store not available")
                return ""
            
            # Create document with metadata
            doc = Document(
                page_content=resume_text,
                metadata={
                    "user_id": user_id,
                    "type": "resume",
                    "timestamp": datetime.now().isoformat(),
                    "analysis": json.dumps(analysis_result),
                    "skills": json.dumps(analysis_result.get("skills", [])),
                    "experience_level": analysis_result.get("experience_level", "")
                }
            )
            
            # Store in vector database
            vector_store = self.vector_stores["user_resumes"]
            doc_ids = vector_store.add_documents([doc])
            
            # Update user profile
            await self._update_user_profile(user_id, "resume", analysis_result)
            
            logger.info(f"Stored resume data for user {user_id}")
            return doc_ids[0] if doc_ids else ""
            
        except Exception as e:
            logger.error(f"Failed to store resume data: {e}")
            return ""
    
    async def store_job_interaction(self, user_id: str, job_data: Dict[str, Any], 
                                  interaction_type: str) -> str:
        """Store job interaction (view, apply, save, etc.)"""
        try:
            if "user_interactions" not in self.vector_stores:
                return ""
            
            content = f"""
            Job Title: {job_data.get('title', '')}
            Company: {job_data.get('company', '')}
            Location: {job_data.get('location', '')}
            Description: {job_data.get('description', '')[:500]}...
            """
            
            doc = Document(
                page_content=content,
                metadata={
                    "user_id": user_id,
                    "type": "job_interaction",
                    "interaction_type": interaction_type,  # view, apply, save, reject
                    "job_id": job_data.get("id", ""),
                    "job_title": job_data.get("title", ""),
                    "company": job_data.get("company", ""),
                    "timestamp": datetime.now().isoformat(),
                    "salary_range": job_data.get("salary_range", ""),
                    "skills_required": json.dumps(job_data.get("skills_required", []))
                }
            )
            
            vector_store = self.vector_stores["user_interactions"]
            doc_ids = vector_store.add_documents([doc])
            
            # Update user preferences based on interaction
            await self._update_job_preferences(user_id, job_data, interaction_type)
            
            return doc_ids[0] if doc_ids else ""
            
        except Exception as e:
            logger.error(f"Failed to store job interaction: {e}")
            return ""
    
    async def store_market_intelligence(self, job_title: str, location: str, 
                                      market_data: Dict[str, Any]) -> str:
        """Store market intelligence data"""
        try:
            if "market_intelligence" not in self.vector_stores:
                return ""
            
            content = f"""
            Market Analysis for {job_title} in {location}
            Demand Level: {market_data.get('demand_level', '')}
            Salary Range: {market_data.get('salary_range', {})}
            Top Skills: {', '.join(market_data.get('top_skills', []))}
            Market Trends: {', '.join(market_data.get('market_trends', []))}
            """
            
            doc = Document(
                page_content=content,
                metadata={
                    "type": "market_intelligence",
                    "job_title": job_title,
                    "location": location,
                    "timestamp": datetime.now().isoformat(),
                    "demand_level": market_data.get("demand_level", ""),
                    "salary_min": market_data.get("salary_range", {}).get("min", 0),
                    "salary_max": market_data.get("salary_range", {}).get("max", 0),
                    "data": json.dumps(market_data)
                }
            )
            
            vector_store = self.vector_stores["market_intelligence"]
            doc_ids = vector_store.add_documents([doc])
            
            return doc_ids[0] if doc_ids else ""
            
        except Exception as e:
            logger.error(f"Failed to store market intelligence: {e}")
            return ""
    
    async def get_user_context(self, user_id: str, query: str, context_type: str = None, 
                             max_results: int = 5) -> List[Dict[str, Any]]:
        """Retrieve relevant context for user based on query"""
        try:
            context_results = []
            
            # Search across relevant collections
            collections_to_search = ["user_resumes", "user_interactions"]
            if context_type:
                collections_to_search = [context_type]
            
            for collection_name in collections_to_search:
                if collection_name not in self.vector_stores:
                    continue
                
                vector_store = self.vector_stores[collection_name]
                
                # Search with user filter
                docs = vector_store.similarity_search(
                    query,
                    k=max_results,
                    filter={"user_id": user_id} if collection_name in ["user_resumes", "user_interactions"] else None
                )
                
                for doc in docs:
                    context_results.append({
                        "content": doc.page_content,
                        "metadata": doc.metadata,
                        "source": collection_name,
                        "relevance_score": self._calculate_relevance_score(doc, query)
                    })
            
            # Sort by relevance and return top results
            context_results.sort(key=lambda x: x["relevance_score"], reverse=True)
            return context_results[:max_results]
            
        except Exception as e:
            logger.error(f"Failed to retrieve user context: {e}")
            return []
    
    async def get_conversation_memory(self, user_id: str, max_messages: int = 10) -> List[BaseMessage]:
        """Get conversation memory for user"""
        try:
            if user_id not in self.conversation_memories:
                self.conversation_memories[user_id] = ConversationBufferWindowMemory(
                    k=max_messages,
                    return_messages=True
                )
            
            memory = self.conversation_memories[user_id]
            return memory.chat_memory.messages
            
        except Exception as e:
            logger.error(f"Failed to get conversation memory: {e}")
            return []
    
    async def add_to_conversation_memory(self, user_id: str, human_message: str, 
                                       ai_message: str):
        """Add interaction to conversation memory"""
        try:
            if user_id not in self.conversation_memories:
                self.conversation_memories[user_id] = ConversationBufferWindowMemory(
                    k=20,
                    return_messages=True
                )
            
            memory = self.conversation_memories[user_id]
            memory.chat_memory.add_user_message(human_message)
            memory.chat_memory.add_ai_message(ai_message)
            
        except Exception as e:
            logger.error(f"Failed to add to conversation memory: {e}")
    
    async def get_similar_resumes(self, resume_text: str, max_results: int = 3) -> List[Dict[str, Any]]:
        """Find similar resumes for benchmarking and insights"""
        try:
            if "user_resumes" not in self.vector_stores:
                return []
            
            vector_store = self.vector_stores["user_resumes"]
            docs = vector_store.similarity_search(resume_text, k=max_results)
            
            similar_resumes = []
            for doc in docs:
                metadata = doc.metadata
                similar_resumes.append({
                    "content": doc.page_content[:200] + "...",  # Truncated for privacy
                    "skills": json.loads(metadata.get("skills", "[]")),
                    "experience_level": metadata.get("experience_level", ""),
                    "analysis": json.loads(metadata.get("analysis", "{}")),
                    "similarity_score": self._calculate_similarity_score(resume_text, doc.page_content)
                })
            
            return similar_resumes
            
        except Exception as e:
            logger.error(f"Failed to find similar resumes: {e}")
            return []
    
    async def get_job_recommendations(self, user_id: str, max_results: int = 10) -> List[Dict[str, Any]]:
        """Get job recommendations based on user history and preferences"""
        try:
            user_profile = self.user_profiles.get(user_id, {})
            
            # Get user's skills and preferences
            user_skills = user_profile.get("skills", [])
            preferred_locations = user_profile.get("preferred_locations", [])
            preferred_companies = user_profile.get("preferred_companies", [])
            
            # Build search query from user profile
            query = f"Skills: {', '.join(user_skills[:5])} Locations: {', '.join(preferred_locations)}"
            
            # Search job descriptions
            if "job_descriptions" in self.vector_stores:
                vector_store = self.vector_stores["job_descriptions"]
                docs = vector_store.similarity_search(query, k=max_results)
                
                recommendations = []
                for doc in docs:
                    job_data = json.loads(doc.metadata.get("job_data", "{}"))
                    match_score = self._calculate_job_match_score(user_profile, job_data)
                    
                    recommendations.append({
                        "job_data": job_data,
                        "match_score": match_score,
                        "recommendation_reason": self._get_recommendation_reason(user_profile, job_data)
                    })
                
                # Sort by match score
                recommendations.sort(key=lambda x: x["match_score"], reverse=True)
                return recommendations
            
            return []
            
        except Exception as e:
            logger.error(f"Failed to get job recommendations: {e}")
            return []
    
    async def _update_user_profile(self, user_id: str, data_type: str, data: Dict[str, Any]):
        """Update user profile with new data"""
        try:
            if user_id not in self.user_profiles:
                self.user_profiles[user_id] = {
                    "created_at": datetime.now().isoformat(),
                    "last_updated": datetime.now().isoformat(),
                    "skills": [],
                    "preferred_locations": [],
                    "preferred_companies": [],
                    "salary_expectations": {},
                    "job_preferences": {}
                }
            
            profile = self.user_profiles[user_id]
            profile["last_updated"] = datetime.now().isoformat()
            
            if data_type == "resume":
                # Update skills from resume analysis
                if "skills" in data:
                    profile["skills"] = list(set(profile["skills"] + data["skills"]))
                
                # Update experience level
                if "experience_level" in data:
                    profile["experience_level"] = data["experience_level"]
                
                # Update preferred locations if location data available
                if "location" in data:
                    location = data["location"]
                    if location and location not in profile["preferred_locations"]:
                        profile["preferred_locations"].append(location)
            
            # Save updated profile
            await self._save_user_profiles()
            
        except Exception as e:
            logger.error(f"Failed to update user profile: {e}")
    
    async def _update_job_preferences(self, user_id: str, job_data: Dict[str, Any], 
                                    interaction_type: str):
        """Update job preferences based on user interactions"""
        try:
            profile = self.user_profiles.get(user_id, {})
            if "job_preferences" not in profile:
                profile["job_preferences"] = {}
            
            prefs = profile["job_preferences"]
            
            # Update preferences based on positive interactions
            if interaction_type in ["apply", "save"]:
                # Preferred job titles
                title = job_data.get("title", "")
                if title:
                    prefs.setdefault("preferred_titles", [])
                    if title not in prefs["preferred_titles"]:
                        prefs["preferred_titles"].append(title)
                
                # Preferred companies
                company = job_data.get("company", "")
                if company:
                    prefs.setdefault("preferred_companies", [])
                    if company not in prefs["preferred_companies"]:
                        prefs["preferred_companies"].append(company)
                
                # Preferred locations
                location = job_data.get("location", "")
                if location:
                    prefs.setdefault("preferred_locations", [])
                    if location not in prefs["preferred_locations"]:
                        prefs["preferred_locations"].append(location)
            
            # Update negative preferences for rejected jobs
            elif interaction_type == "reject":
                prefs.setdefault("rejected_companies", [])
                company = job_data.get("company", "")
                if company and company not in prefs["rejected_companies"]:
                    prefs["rejected_companies"].append(company)
            
            await self._save_user_profiles()
            
        except Exception as e:
            logger.error(f"Failed to update job preferences: {e}")
    
    async def _save_user_profiles(self):
        """Save user profiles to storage"""
        try:
            os.makedirs("./data", exist_ok=True)
            with open("./data/user_profiles.json", 'w') as f:
                json.dump(self.user_profiles, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save user profiles: {e}")
    
    def _calculate_relevance_score(self, doc: Document, query: str) -> float:
        """Calculate relevance score for context ranking"""
        try:
            # Simple TF-IDF-like scoring
            query_terms = query.lower().split()
            content_terms = doc.page_content.lower().split()
            
            matches = sum(1 for term in query_terms if term in content_terms)
            score = matches / len(query_terms) if query_terms else 0
            
            # Boost score for recent documents
            timestamp = doc.metadata.get("timestamp", "")
            if timestamp:
                doc_time = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                age_days = (datetime.now() - doc_time).days
                recency_boost = max(0, 1 - (age_days / 30))  # Decay over 30 days
                score *= (1 + recency_boost * 0.5)
            
            return score
            
        except Exception as e:
            logger.error(f"Relevance calculation failed: {e}")
            return 0.0
    
    def _calculate_similarity_score(self, text1: str, text2: str) -> float:
        """Calculate similarity score between two texts"""
        try:
            # Simple Jaccard similarity
            words1 = set(text1.lower().split())
            words2 = set(text2.lower().split())
            
            intersection = words1.intersection(words2)
            union = words1.union(words2)
            
            return len(intersection) / len(union) if union else 0.0
            
        except Exception as e:
            logger.error(f"Similarity calculation failed: {e}")
            return 0.0
    
    def _calculate_job_match_score(self, user_profile: Dict[str, Any], job_data: Dict[str, Any]) -> float:
        """Calculate job match score based on user profile"""
        try:
            score = 0.0
            
            # Skills match (40% weight)
            user_skills = set(skill.lower() for skill in user_profile.get("skills", []))
            job_skills = set(skill.lower() for skill in job_data.get("skills_required", []))
            
            if job_skills:
                skills_match = len(user_skills.intersection(job_skills)) / len(job_skills)
                score += skills_match * 0.4
            
            # Location match (20% weight)
            preferred_locations = [loc.lower() for loc in user_profile.get("preferred_locations", [])]
            job_location = job_data.get("location", "").lower()
            
            if job_location in preferred_locations:
                score += 0.2
            
            # Company match (15% weight)
            preferred_companies = [comp.lower() for comp in user_profile.get("preferred_companies", [])]
            job_company = job_data.get("company", "").lower()
            
            if job_company in preferred_companies:
                score += 0.15
            
            # Salary match (25% weight)
            salary_expectations = user_profile.get("salary_expectations", {})
            job_salary = job_data.get("salary_range", {})
            
            if salary_expectations and job_salary:
                expected_min = salary_expectations.get("min", 0)
                job_max = job_salary.get("max", 0)
                
                if job_max >= expected_min:
                    score += 0.25
            
            return min(score, 1.0)  # Cap at 1.0
            
        except Exception as e:
            logger.error(f"Job match calculation failed: {e}")
            return 0.0
    
    def _get_recommendation_reason(self, user_profile: Dict[str, Any], job_data: Dict[str, Any]) -> str:
        """Generate explanation for job recommendation"""
        try:
            reasons = []
            
            # Skills match
            user_skills = set(skill.lower() for skill in user_profile.get("skills", []))
            job_skills = set(skill.lower() for skill in job_data.get("skills_required", []))
            matching_skills = user_skills.intersection(job_skills)
            
            if matching_skills:
                reasons.append(f"Matches your skills: {', '.join(list(matching_skills)[:3])}")
            
            # Location match
            preferred_locations = user_profile.get("preferred_locations", [])
            job_location = job_data.get("location", "")
            
            if job_location in preferred_locations:
                reasons.append(f"Located in your preferred area: {job_location}")
            
            # Company match
            preferred_companies = user_profile.get("preferred_companies", [])
            job_company = job_data.get("company", "")
            
            if job_company in preferred_companies:
                reasons.append(f"From a company you've shown interest in: {job_company}")
            
            return "; ".join(reasons) if reasons else "Good match based on your profile"
            
        except Exception as e:
            logger.error(f"Recommendation reason generation failed: {e}")
            return "Recommended for you"
    
    async def cleanup_old_data(self):
        """Clean up old data based on retention policies"""
        try:
            current_time = datetime.now()
            
            for collection_name, vector_store in self.vector_stores.items():
                # Get all documents
                docs = vector_store.get()
                
                docs_to_delete = []
                for doc_id, metadata in zip(docs['ids'], docs['metadatas']):
                    timestamp_str = metadata.get('timestamp', '')
                    if timestamp_str:
                        doc_time = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                        age = current_time - doc_time
                        
                        # Check retention policy
                        data_type = metadata.get('type', MemoryType.SHORT_TERM)
                        max_age = self.retention_policies.get(data_type, timedelta(days=30))
                        
                        if age > max_age:
                            docs_to_delete.append(doc_id)
                
                # Delete old documents
                if docs_to_delete:
                    vector_store.delete(docs_to_delete)
                    logger.info(f"Cleaned up {len(docs_to_delete)} old documents from {collection_name}")
            
        except Exception as e:
            logger.error(f"Data cleanup failed: {e}")
    
    async def get_memory_statistics(self) -> Dict[str, Any]:
        """Get memory usage statistics"""
        try:
            stats = {
                "collections": {},
                "user_profiles": len(self.user_profiles),
                "conversation_memories": len(self.conversation_memories),
                "total_embeddings_available": self.embeddings is not None
            }
            
            for collection_name, vector_store in self.vector_stores.items():
                try:
                    docs = vector_store.get()
                    stats["collections"][collection_name] = {
                        "document_count": len(docs['ids']),
                        "last_updated": datetime.now().isoformat()
                    }
                except Exception as e:
                    stats["collections"][collection_name] = {"error": str(e)}
            
            return stats
            
        except Exception as e:
            logger.error(f"Failed to get memory statistics: {e}")
            return {}
    
    async def persist_all(self):
        """Persist all vector stores and data"""
        try:
            for collection_name, vector_store in self.vector_stores.items():
                if hasattr(vector_store, 'persist'):
                    vector_store.persist()
                    
            await self._save_user_profiles()
            logger.info("All memory data persisted")
            
        except Exception as e:
            logger.error(f"Failed to persist memory data: {e}") 