import asyncio
import logging
import os
import time
from typing import Dict, List, Any, Optional, AsyncGenerator
from dataclasses import dataclass
from enum import Enum

from langchain_openai import ChatOpenAI
from langchain_community.llms import Ollama
from langchain.callbacks.streaming_stdout import StreamingStdOutCallbackHandler
from langchain.callbacks.base import BaseCallbackHandler
from langchain.schema import BaseMessage, HumanMessage, SystemMessage

logger = logging.getLogger(__name__)

class TaskComplexity(Enum):
    LOW = "low"
    MEDIUM = "medium" 
    HIGH = "high"
    CRITICAL = "critical"

class TaskType(Enum):
    RESUME_ANALYSIS = "resume_analysis"
    COVER_LETTER = "cover_letter"
    JOB_ANALYSIS = "job_analysis"
    CAREER_ADVICE = "career_advice"
    AUTO_APPLY = "auto_apply"
    MARKET_INTELLIGENCE = "market_intelligence"

@dataclass
class ModelConfig:
    name: str
    provider: str
    max_tokens: int
    cost_per_token: float
    speed_score: int  # 1-10
    quality_score: int  # 1-10
    context_window: int
    suitable_tasks: List[TaskType]

@dataclass
class TaskMetrics:
    start_time: float
    end_time: float
    tokens_used: int
    cost: float
    quality_score: float
    model_used: str

class StreamingCallbackHandler(BaseCallbackHandler):
    """Custom streaming callback for real-time responses"""
    
    def __init__(self, websocket=None):
        self.websocket = websocket
        self.tokens = []
    
    async def on_llm_new_token(self, token: str, **kwargs) -> None:
        """Handle new token streaming"""
        self.tokens.append(token)
        if self.websocket:
            try:
                await self.websocket.send_text(json.dumps({
                    "type": "token",
                    "content": token
                }))
            except Exception as e:
                logger.warning(f"WebSocket streaming failed: {e}")

class LLMOptimizer:
    """Intelligent LLM selection and optimization service"""
    
    def __init__(self):
        self.models = self._initialize_model_configs()
        self.performance_history = {}
        self.current_usage = {}
        self.rate_limits = {}
        
    def _initialize_model_configs(self) -> Dict[str, ModelConfig]:
        """Initialize model configurations with capabilities"""
        models = {}
        
        # OpenAI Models
        models["gpt-4"] = ModelConfig(
            name="gpt-4",
            provider="openai",
            max_tokens=8192,
            cost_per_token=0.00003,
            speed_score=6,
            quality_score=10,
            context_window=8192,
            suitable_tasks=[TaskType.RESUME_ANALYSIS, TaskType.JOB_ANALYSIS, 
                          TaskType.CAREER_ADVICE, TaskType.MARKET_INTELLIGENCE]
        )
        
        models["gpt-3.5-turbo"] = ModelConfig(
            name="gpt-3.5-turbo",
            provider="openai",
            max_tokens=4096,
            cost_per_token=0.000002,
            speed_score=9,
            quality_score=8,
            context_window=4096,
            suitable_tasks=[TaskType.COVER_LETTER, TaskType.AUTO_APPLY]
        )
        
        # Ollama Models
        models["llama2"] = ModelConfig(
            name="llama2",
            provider="ollama",
            max_tokens=2048,
            cost_per_token=0.0,  # Free local model
            speed_score=7,
            quality_score=7,
            context_window=2048,
            suitable_tasks=[TaskType.COVER_LETTER, TaskType.CAREER_ADVICE]
        )
        
        models["codellama"] = ModelConfig(
            name="codellama",
            provider="ollama", 
            max_tokens=2048,
            cost_per_token=0.0,
            speed_score=8,
            quality_score=6,
            context_window=2048,
            suitable_tasks=[TaskType.AUTO_APPLY]
        )
        
        # Mistral Models
        models["mistral-7b"] = ModelConfig(
            name="mistral-7b-instruct",
            provider="mistral",
            max_tokens=4096,
            cost_per_token=0.0,
            speed_score=8,
            quality_score=7,
            context_window=4096,
            suitable_tasks=[TaskType.COVER_LETTER, TaskType.RESUME_ANALYSIS]
        )
        
        return models
    
    async def select_optimal_model(self, task_type: TaskType, complexity: TaskComplexity, 
                                 context_length: int = 0, budget_priority: bool = False) -> str:
        """Select optimal model based on task requirements"""
        try:
            # Filter models suitable for task
            suitable_models = [
                model for model in self.models.values()
                if task_type in model.suitable_tasks and model.context_window >= context_length
            ]
            
            if not suitable_models:
                logger.warning(f"No suitable models for {task_type}, using default")
                return "gpt-4"
            
            # Score models based on requirements
            scored_models = []
            for model in suitable_models:
                score = self._calculate_model_score(model, complexity, budget_priority)
                if self._check_availability(model.name):
                    scored_models.append((model.name, score))
            
            if not scored_models:
                return "gpt-4"  # Fallback
            
            # Return highest scored available model
            best_model = max(scored_models, key=lambda x: x[1])[0]
            logger.info(f"Selected {best_model} for {task_type.value} (complexity: {complexity.value})")
            return best_model
            
        except Exception as e:
            logger.error(f"Model selection failed: {e}")
            return "gpt-4"
    
    def _calculate_model_score(self, model: ModelConfig, complexity: TaskComplexity, 
                             budget_priority: bool) -> float:
        """Calculate model score based on requirements"""
        score = 0.0
        
        # Quality weight based on complexity
        quality_weight = {
            TaskComplexity.LOW: 0.3,
            TaskComplexity.MEDIUM: 0.6,
            TaskComplexity.HIGH: 0.8,
            TaskComplexity.CRITICAL: 1.0
        }[complexity]
        
        # Speed vs Quality vs Cost balance
        if budget_priority:
            score = (model.quality_score * quality_weight * 0.4 + 
                    model.speed_score * 0.3 + 
                    (10 - model.cost_per_token * 100000) * 0.3)  # Lower cost = higher score
        else:
            score = (model.quality_score * quality_weight * 0.7 + 
                    model.speed_score * 0.3)
        
        # Boost score for free models if budget priority
        if budget_priority and model.cost_per_token == 0:
            score *= 1.2
        
        return score
    
    def _check_availability(self, model_name: str) -> bool:
        """Check if model is available and within rate limits"""
        try:
            model = self.models.get(model_name)
            if not model:
                return False
            
            # Check API keys for external models
            if model.provider == "openai" and not os.getenv("OPENAI_API_KEY"):
                return False
            
            # Check rate limits
            if model_name in self.rate_limits:
                last_used = self.rate_limits[model_name]
                if time.time() - last_used < 1:  # Basic rate limiting
                    return False
            
            return True
            
        except Exception as e:
            logger.warning(f"Availability check failed for {model_name}: {e}")
            return False
    
    async def create_optimized_llm(self, model_name: str, streaming: bool = False, 
                                 websocket=None) -> Any:
        """Create optimized LLM instance with streaming if requested"""
        try:
            model = self.models.get(model_name)
            if not model:
                raise ValueError(f"Unknown model: {model_name}")
            
            callbacks = []
            if streaming:
                callbacks.append(StreamingCallbackHandler(websocket))
            
            if model.provider == "openai":
                return ChatOpenAI(
                    model_name=model.name,
                    temperature=float(os.getenv("LLM_TEMPERATURE", "0.7")),
                    max_tokens=model.max_tokens,
                    streaming=streaming,
                    callbacks=callbacks if callbacks else None
                )
            elif model.provider == "ollama":
                return Ollama(
                    model=model.name,
                    base_url=os.getenv("OLLAMA_URL", "http://localhost:11434"),
                    temperature=float(os.getenv("LLM_TEMPERATURE", "0.7")),
                    callbacks=callbacks if callbacks else None
                )
            else:
                raise ValueError(f"Unsupported provider: {model.provider}")
                
        except Exception as e:
            logger.error(f"Failed to create LLM {model_name}: {e}")
            raise
    
    def manage_context_window(self, messages: List[BaseMessage], model_name: str) -> List[BaseMessage]:
        """Manage context window to prevent overflow"""
        try:
            model = self.models.get(model_name)
            if not model:
                return messages
            
            # Estimate token count (rough approximation)
            total_tokens = sum(len(msg.content.split()) * 1.3 for msg in messages)
            
            if total_tokens <= model.context_window * 0.8:  # 80% safety margin
                return messages
            
            # Trim messages while keeping system message
            system_msgs = [msg for msg in messages if isinstance(msg, SystemMessage)]
            other_msgs = [msg for msg in messages if not isinstance(msg, SystemMessage)]
            
            # Keep most recent messages that fit
            trimmed_msgs = system_msgs
            current_tokens = sum(len(msg.content.split()) * 1.3 for msg in system_msgs)
            
            for msg in reversed(other_msgs):
                msg_tokens = len(msg.content.split()) * 1.3
                if current_tokens + msg_tokens <= model.context_window * 0.8:
                    trimmed_msgs.insert(-len(system_msgs) or len(trimmed_msgs), msg)
                    current_tokens += msg_tokens
                else:
                    break
            
            logger.info(f"Trimmed context from {len(messages)} to {len(trimmed_msgs)} messages")
            return trimmed_msgs
            
        except Exception as e:
            logger.error(f"Context management failed: {e}")
            return messages
    
    async def stream_response(self, llm: Any, messages: List[BaseMessage]) -> AsyncGenerator[str, None]:
        """Stream response from LLM"""
        try:
            # For streaming responses
            async for token in llm.astream(messages):
                if hasattr(token, 'content'):
                    yield token.content
                else:
                    yield str(token)
        except Exception as e:
            logger.error(f"Streaming failed: {e}")
            yield f"Error: {str(e)}"
    
    def record_performance(self, model_name: str, task_type: TaskType, metrics: TaskMetrics):
        """Record performance metrics for real-time model optimization"""
        try:
            key = f"{model_name}:{task_type.value}"
            if key not in self.performance_history:
                self.performance_history[key] = []
            
            self.performance_history[key].append(metrics)
            
            # Keep only last 100 entries per model-task combination
            if len(self.performance_history[key]) > 100:
                self.performance_history[key] = self.performance_history[key][-100:]
            
            # Real-time performance tracking and model ranking
            self._update_real_time_rankings(model_name, task_type, metrics)
                
        except Exception as e:
            logger.error(f"Failed to record performance: {e}")
    
    def _update_real_time_rankings(self, model_name: str, task_type: TaskType, metrics: TaskMetrics):
        """Update real-time model rankings based on latest performance"""
        try:
            if not hasattr(self, 'real_time_rankings'):
                self.real_time_rankings = {}
            
            key = f"{model_name}:{task_type.value}"
            
            # Calculate composite performance score
            latency_score = max(0, 10 - min(10, (metrics.end_time - metrics.start_time)))  # Lower latency = higher score
            cost_score = max(0, 10 - min(10, metrics.cost * 10000))  # Lower cost = higher score  
            quality_score = metrics.quality_score
            
            # Weighted performance score: 50% quality, 30% speed, 20% cost
            composite_score = (quality_score * 0.5) + (latency_score * 0.3) + (cost_score * 0.2)
            
            if key not in self.real_time_rankings:
                self.real_time_rankings[key] = {
                    'scores': [],
                    'avg_score': 0,
                    'last_updated': metrics.end_time,
                    'request_count': 0
                }
            
            ranking = self.real_time_rankings[key]
            ranking['scores'].append(composite_score)
            ranking['request_count'] += 1
            ranking['last_updated'] = metrics.end_time
            
            # Keep last 50 scores for moving average
            if len(ranking['scores']) > 50:
                ranking['scores'] = ranking['scores'][-50:]
            
            # Update moving average
            ranking['avg_score'] = sum(ranking['scores']) / len(ranking['scores'])
            
            logger.debug(f"Updated real-time ranking for {key}: score={composite_score:.2f}, avg={ranking['avg_score']:.2f}")
            
        except Exception as e:
            logger.warning(f"Failed to update real-time rankings: {e}")
    
    def get_best_model_real_time(self, task_type: TaskType, fallback_complexity: TaskComplexity = TaskComplexity.MEDIUM) -> str:
        """Get the best performing model for a task based on real-time performance data"""
        try:
            if not hasattr(self, 'real_time_rankings') or not self.real_time_rankings:
                # Fallback to static selection if no performance data
                return await self.select_optimal_model(task_type, fallback_complexity)
            
            # Find best model for this task type based on real-time performance
            best_model = None
            best_score = 0
            min_requests = 5  # Minimum requests needed for reliable ranking
            
            for key, ranking in self.real_time_rankings.items():
                model_name, task_name = key.split(":")
                if (task_name == task_type.value and 
                    ranking['request_count'] >= min_requests and 
                    ranking['avg_score'] > best_score):
                    
                    best_score = ranking['avg_score']
                    best_model = model_name
            
            if best_model:
                logger.info(f"Selected best performing model for {task_type.value}: {best_model} (score: {best_score:.2f})")
                return best_model
            else:
                # Fallback if no model has enough performance data
                logger.info(f"No sufficient performance data for {task_type.value}, using static selection")
                return await self.select_optimal_model(task_type, fallback_complexity)
                
        except Exception as e:
            logger.warning(f"Real-time model selection failed: {e}")
            return "gpt-4"  # Safe fallback
    
    def get_performance_insights(self) -> Dict[str, Any]:
        """Get performance insights and recommendations"""
        try:
            insights = {
                "model_rankings": {},
                "cost_analysis": {},
                "speed_analysis": {},
                "recommendations": []
            }
            
            # Analyze performance by model and task
            for key, metrics_list in self.performance_history.items():
                if not metrics_list:
                    continue
                
                model_name, task_type = key.split(":")
                avg_cost = sum(m.cost for m in metrics_list) / len(metrics_list)
                avg_time = sum(m.end_time - m.start_time for m in metrics_list) / len(metrics_list)
                avg_quality = sum(m.quality_score for m in metrics_list) / len(metrics_list)
                
                insights["model_rankings"][key] = {
                    "average_cost": avg_cost,
                    "average_time": avg_time,
                    "average_quality": avg_quality,
                    "total_requests": len(metrics_list)
                }
            
            # Generate recommendations
            insights["recommendations"] = self._generate_recommendations(insights["model_rankings"])
            
            return insights
            
        except Exception as e:
            logger.error(f"Performance analysis failed: {e}")
            return {}
    
    def _generate_recommendations(self, rankings: Dict[str, Any]) -> List[str]:
        """Generate optimization recommendations"""
        recommendations = []
        
        try:
            # Find best performing models per task
            task_best = {}
            for key, metrics in rankings.items():
                model_name, task_type = key.split(":")
                score = metrics["average_quality"] / max(metrics["average_cost"] * 1000 + 0.001, 0.001)
                
                if task_type not in task_best or score > task_best[task_type]["score"]:
                    task_best[task_type] = {"model": model_name, "score": score}
            
            for task_type, best in task_best.items():
                recommendations.append(
                    f"For {task_type}, consider using {best['model']} for optimal quality/cost ratio"
                )
            
            return recommendations
            
        except Exception as e:
            logger.error(f"Recommendation generation failed: {e}")
            return ["Performance analysis unavailable"]
    
    async def optimize_prompt(self, prompt: str, task_type: TaskType) -> str:
        """Optimize prompts for specific tasks and models"""
        try:
            # Task-specific prompt optimizations
            optimizations = {
                TaskType.RESUME_ANALYSIS: [
                    "Be specific with metrics and quantifiable achievements",
                    "Focus on ATS optimization keywords",
                    "Provide structured JSON output"
                ],
                TaskType.COVER_LETTER: [
                    "Emphasize personalization and company research",
                    "Keep concise but impactful",
                    "Include specific examples"
                ],
                TaskType.JOB_ANALYSIS: [
                    "Include market trends and salary data",
                    "Focus on actionable insights",
                    "Provide competitive analysis"
                ]
            }
            
            task_tips = optimizations.get(task_type, [])
            if task_tips:
                optimized_prompt = prompt + "\n\nOptimization Guidelines:\n"
                optimized_prompt += "\n".join(f"- {tip}" for tip in task_tips)
                return optimized_prompt
            
            return prompt
            
        except Exception as e:
            logger.error(f"Prompt optimization failed: {e}")
            return prompt 