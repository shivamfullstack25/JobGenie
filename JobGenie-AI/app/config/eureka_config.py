import os
import json
import logging
import asyncio
import aiohttp
from typing import Dict, Any

logger = logging.getLogger(__name__)

class EurekaClient:
    """Eureka service discovery client for Python AI service"""
    
    def __init__(self):
        self.eureka_server = os.getenv('EUREKA_SERVER_URL', 'http://eureka-server:8761/eureka').rstrip('/')
        self.service_name = 'ai-service'
        self.service_port = int(os.getenv('SERVICE_PORT', '8000'))
        self.service_host = os.getenv('SERVICE_HOST', 'ai-service')
        self.health_check_url = f"http://{self.service_host}:{self.service_port}/health"
        self.instance_id = f"{self.service_name}:{self.service_port}"
        self.heartbeat_interval = 30  # seconds
        self.registration_task = None
        self.heartbeat_task = None
        
    def _create_instance_info(self) -> Dict[str, Any]:
        """Create Eureka instance information"""
        return {
            "instance": {
                "instanceId": self.instance_id,
                "hostName": self.service_host,
                "app": self.service_name.upper(),
                "ipAddr": self.service_host,
                "status": "UP",
                "overriddenstatus": "UNKNOWN",
                "port": {
                    "$": self.service_port,
                    "@enabled": "true"
                },
                "securePort": {
                    "$": 443,
                    "@enabled": "false"
                },
                "countryId": 1,
                "dataCenterInfo": {
                    "@class": "com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo",
                    "name": "MyOwn"
                },
                "leaseInfo": {
                    "renewalIntervalInSecs": 30,
                    "durationInSecs": 90,
                    "registrationTimestamp": 0,
                    "lastRenewalTimestamp": 0,
                    "evictionTimestamp": 0,
                    "serviceUpTimestamp": 0
                },
                "metadata": {
                    "management.port": str(self.service_port),
                    "instanceId": self.instance_id
                },
                "homePageUrl": f"http://{self.service_host}:{self.service_port}/",
                "statusPageUrl": f"http://{self.service_host}:{self.service_port}/health",
                "healthCheckUrl": self.health_check_url,
                "vipAddress": self.service_name,
                "secureVipAddress": self.service_name,
                "isCoordinatingDiscoveryServer": "false",
                "lastUpdatedTimestamp": 0,
                "lastDirtyTimestamp": 0,
                "actionType": "ADDED"
            }
        }
    
    async def register_with_eureka(self) -> bool:
        """Register service with Eureka server"""
        try:
            instance_info = self._create_instance_info()
            url = f"{self.eureka_server}/apps/{self.service_name.upper()}"
            
            headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=instance_info, headers=headers) as response:
                    if response.status in [200, 204]:
                        logger.info(f"Successfully registered {self.service_name} with Eureka")
                        return True
                    else:
                        logger.error(f"Failed to register with Eureka: {response.status}")
                        return False
                        
        except Exception as e:
            logger.error(f"Error registering with Eureka: {e}")
            return False
    
    async def send_heartbeat(self) -> bool:
        """Send heartbeat to Eureka server"""
        try:
            url = f"{self.eureka_server}/apps/{self.service_name.upper()}/{self.instance_id}"
            
            async with aiohttp.ClientSession() as session:
                async with session.put(url) as response:
                    if response.status == 200:
                        logger.debug(f"Heartbeat sent successfully for {self.service_name}")
                        return True
                    else:
                        logger.warning(f"Heartbeat failed: {response.status}")
                        return False
                        
        except Exception as e:
            logger.error(f"Error sending heartbeat: {e}")
            return False
    
    async def deregister_from_eureka(self) -> bool:
        """Deregister service from Eureka server"""
        try:
            url = f"{self.eureka_server}/apps/{self.service_name.upper()}/{self.instance_id}"
            
            async with aiohttp.ClientSession() as session:
                async with session.delete(url) as response:
                    if response.status == 200:
                        logger.info(f"Successfully deregistered {self.service_name} from Eureka")
                        return True
                    else:
                        logger.error(f"Failed to deregister from Eureka: {response.status}")
                        return False
                        
        except Exception as e:
            logger.error(f"Error deregistering from Eureka: {e}")
            return False
    
    async def start_heartbeat_task(self):
        """Start the heartbeat task"""
        async def heartbeat_loop():
            while True:
                try:
                    await self.send_heartbeat()
                    await asyncio.sleep(self.heartbeat_interval)
                except asyncio.CancelledError:
                    logger.info("Heartbeat task cancelled")
                    break
                except Exception as e:
                    logger.error(f"Error in heartbeat loop: {e}")
                    await asyncio.sleep(self.heartbeat_interval)
        
        self.heartbeat_task = asyncio.create_task(heartbeat_loop())
    
    async def start_service_discovery(self):
        """Start service discovery registration and heartbeat"""
        try:
            # Register with Eureka
            registration_success = await self.register_with_eureka()
            if registration_success:
                # Start heartbeat task
                await self.start_heartbeat_task()
                logger.info(f"Service discovery started for {self.service_name}")
            else:
                logger.warning("Failed to register with Eureka, service discovery disabled")
                
        except Exception as e:
            logger.error(f"Error starting service discovery: {e}")
    
    async def stop_service_discovery(self):
        """Stop service discovery and deregister"""
        try:
            # Cancel heartbeat task
            if self.heartbeat_task:
                self.heartbeat_task.cancel()
                try:
                    await self.heartbeat_task
                except asyncio.CancelledError:
                    pass
            
            # Deregister from Eureka
            await self.deregister_from_eureka()
            logger.info("Service discovery stopped")
            
        except Exception as e:
            logger.error(f"Error stopping service discovery: {e}")

# Global instance
eureka_client = EurekaClient()

async def initialize_service_discovery():
    """Initialize service discovery"""
    try:
        await eureka_client.start_service_discovery()
    except Exception as e:
        logger.error(f"Failed to initialize service discovery: {e}")

async def cleanup_service_discovery():
    """Cleanup service discovery"""
    try:
        await eureka_client.stop_service_discovery()
    except Exception as e:
        logger.error(f"Failed to cleanup service discovery: {e}")

# Export for use in main application
__all__ = ['eureka_client', 'initialize_service_discovery', 'cleanup_service_discovery'] 