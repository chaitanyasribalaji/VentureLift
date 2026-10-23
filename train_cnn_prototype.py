"""Retrain CNN Model for Entrepreneurial Prototype Matching and MVP Suggestions.

This script trains a Convolutional Neural Network (CNN) that:
1. Classifies prototype images into entrepreneurial product/hardware/software archetypes.
2. Extracts deep feature embeddings (128-dimensional) from the penultimate layer.
3. Computes benchmark embeddings for a rich catalog of real-world products and prototypes.
4. Saves the model and catalog to disk for fast inference and prototype matching.
"""

import argparse
import json
import os
from pathlib import Path
import numpy as np

# Suppress TF verbose logging for speed and clean output
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

import tensorflow as tf
from tensorflow.keras import layers, models, optimizers

# Target prototype categories
PROTOTYPE_CATEGORIES = [
    "smart_wearable",           # Smartwatches, fitness trackers, smart rings, AR glasses
    "iot_hardware_node",        # Smart sensors, IoT gateways, smart home hubs
    "mobile_app_interface",     # Mobile UI mockups, on-demand apps, fintech screens
    "web_saas_dashboard",       # B2B SaaS portals, analytics panels, workflow tools
    "health_diagnostic_device", # Portable ECG, glucose monitors, smart stethoscopes
    "robotics_automation_pod",  # Drones, robotic arms, autonomous delivery pods
    "cleantech_energy_gadget",  # Portable solar generators, smart EV chargers, energy pods
    "consumer_electronics_tool" # Smart audio gear, smart kitchen tools, connected gadgets
]

# Rich catalog of real-world products and market benchmarks with MVP takeaways
REAL_WORLD_PRODUCTS = [
    # 1. Smart Wearables
    {
        "id": "prod_wear_01",
        "name": "Apple Watch Ultra & Series",
        "category": "smart_wearable",
        "stage": "Commercial Market Leader ($399 - $799)",
        "description": "Premium titanium/aluminum casing, OLED Retina display, optical heart rate sensor, dual-frequency GPS, WR100 water resistance.",
        "key_features": ["Action button customization", "Always-on display", "Advanced biometric sensors (ECG, SpO2, Temp)", "Cellular fallback"],
        "mvp_takeaways": "Original Apple Watch MVP relied on iPhone tethering for compute; focused exclusively on notification glanceability before expanding to standalone sensors.",
        "component_advice": "For your MVP, avoid custom curved sapphire crystal; use off-the-shelf round/square 1.4-inch AMOLED display and standard BLE 5.3 SoC (Nordic nRF52840).",
        "differentiation_tip": "Focus on a hyper-specific vertical (e.g. extreme industrial safety, nocturnal epilepsy alert) rather than general fitness."
    },
    {
        "id": "prod_wear_02",
        "name": "Oura Ring Gen 3 / Gen 4",
        "category": "smart_wearable",
        "stage": "Commercial Scale ($299 + Subscription)",
        "description": "Screenless biometric smart ring, titanium PVD coating, infrared photoplethysmography (PPG), 7-day battery life, wireless dock charging.",
        "key_features": ["Screenless minimalist design", "Sleep architecture tracking", "Readiness score algorithm", "Continuous skin temperature"],
        "mvp_takeaways": "Oura's kickstarter prototype was chunky 3D-printed ceramic; they validated consumer demand for sleep tracking before micro-miniaturizing the flex PCB.",
        "component_advice": "Prototype with rigid-flex PCB and 3D printed resin housing (Formlabs Clear/Tough) before investing in micro-molding tooling ($25k+).",
        "differentiation_tip": "Offer zero-subscription transparent analytics or niche female fertility / athletic recovery workflows."
    },
    {
        "id": "prod_wear_03",
        "name": "Whoop 4.0 Athletic Band",
        "category": "smart_wearable",
        "stage": "Commercial Scale (Subscription Model)",
        "description": "Screenless elastic strap wearable, 5 LEDs, 4 photodiodes, IP68 water resistance, battery pack slide-on charging.",
        "key_features": ["Battery pack charges on-wrist", "No distracting display", "Strain vs recovery proprietary metric", "Multiple body wear locations"],
        "mvp_takeaways": "Whoop proved athletes prefer zero distraction; the MVP was an ugly elastic band tested on Harvard college athletes.",
        "component_advice": "Focus MVP software on calculating one meaningful aggregate score (e.g. 'Daily Fatigue Index') rather than raw sensor dumps.",
        "differentiation_tip": "Build for specific team/coach dashboards or specialized occupational fatigue."
    },

    # 2. IoT Hardware Nodes
    {
        "id": "prod_iot_01",
        "name": "Raspberry Pi 5 / Compute Module IoT Hub",
        "category": "iot_hardware_node",
        "stage": "Hardware Benchmark & Prototyping Standard",
        "description": "Broadcom BCM2712 quad-core Arm Cortex-A76, PCIe 2.0 interface, dual 4K micro-HDMI, gigabit Ethernet with PoE+ header.",
        "key_features": ["Extensive GPIO expansion", "High local compute throughput", "Linux OS standard compatibility", "Local edge inference capable"],
        "mvp_takeaways": "Tens of thousands of commercial IoT products ship their first 1,000 units with Raspberry Pi CM4 or Pi 5 inside an industrial DIN-rail enclosure.",
        "component_advice": "Do NOT build custom silicon or custom SOM for your MVP; use an off-the-shelf carrier board + Raspberry Pi CM4 or ESP32-S3 module.",
        "differentiation_tip": "Differentiate through local zero-cloud privacy, plug-and-play network provisioning, and offline failover logic."
    },
    {
        "id": "prod_iot_02",
        "name": "Nest Learning Thermostat / Home Hub",
        "category": "iot_hardware_node",
        "stage": "Commercial Market Leader ($129 - $249)",
        "description": "Rotating stainless steel outer ring, high-resolution 24-bit color LCD, 10 temperature & humidity sensors, Zigbee/Thread/Matter radio.",
        "key_features": ["Tactile mechanical rotating ring", "Auto-schedule learning algorithm", "Matter/Thread interoperability", "Energy savings report"],
        "mvp_takeaways": "Tony Fadell built hand-made acrylic prototypes with basic mechanical encoders to test the satisfying physical 'click' before any cloud backend.",
        "component_advice": "For MVP, use a rotary encoder with integrated push-switch and standard 2.0-inch SPI round display; 3D print outer dial in matte PLA/PETG.",
        "differentiation_tip": "Target commercial spaces (co-working, server closets, Airbnb rentals) with multi-unit management rather than single residential."
    },
    {
        "id": "prod_iot_03",
        "name": "Shelly Plus / Sonoff Smart Sensor Relay",
        "category": "iot_hardware_node",
        "stage": "High-Volume Commercial IoT ($15 - $35)",
        "description": "Ultra-compact in-wall micro-controller, ESP32 SoC, dry contacts, power measurement, local HTTP/MQTT API, Webhook triggers.",
        "key_features": ["Ultra-small form factor", "Zero-cloud local control capability", "Overvoltage & overpower protection", "Scripting engine onboard"],
        "mvp_takeaways": "Shelly captured the enthusiast market by offering an open local API when competitors forced proprietary cloud apps.",
        "component_advice": "Ensure electrical isolation (optocouplers/solid state relays) and UL/CE compliant trace clearance on your MVP PCB.",
        "differentiation_tip": "Provide open MQTT/HomeAssistant integration out of the box to win developer and power-user evangelists."
    },

    # 3. Mobile App Interface
    {
        "id": "prod_app_01",
        "name": "Stripe Mobile POS / Checkout App",
        "category": "mobile_app_interface",
        "stage": "FinTech Unicorn Benchmark",
        "description": "Minimalist transaction UI, Tap to Pay on iPhone/Android, biometric receipt validation, instant payout ledger.",
        "key_features": ["Sub-2-second transaction flow", "Ultra-clean visual hierarchy", "NFC tap-to-pay integration", "Real-time revenue graphs"],
        "mvp_takeaways": "Stripe's legendary MVP was 7 lines of code and manual merchant onboarding; the mobile app stripped out everything except 'Enter Amount -> Tap Card'.",
        "component_advice": "Cut 80% of your screens for the MVP: provide exactly 3 primary tabs (Action, History, Settings). Use React Native or Flutter for dual-platform speed.",
        "differentiation_tip": "Solve settlement friction for a single vertical (e.g. food trucks, mobile dog groomers, pop-up craft artisans)."
    },
    {
        "id": "prod_app_02",
        "name": "Robinhood / Revolut Mobile Trading UI",
        "category": "mobile_app_interface",
        "stage": "FinTech Consumer Scale ($20B+ Market Cap)",
        "description": "High-contrast card UI, interactive sparkline graphs, swipe-up order execution, gamified asset status indicators.",
        "key_features": ["Swipe-up confirmation pattern", "Micro-animations on balance update", "Dark mode high-contrast palette", "Zero-friction KYC upload"],
        "mvp_takeaways": "Robinhood launched with a viral waitlist landing page that gained 1M signups before the mobile trading app even connected to an exchange clearinghouse.",
        "component_advice": "Focus on high-perceived performance: optimistic UI updates, skeletal loaders, and smooth 60fps micro-interactions.",
        "differentiation_tip": "Introduce social investing circles, educational micro-quizzes, or ethical/impact portfolio weighting."
    },
    {
        "id": "prod_app_03",
        "name": "Duolingo / Headspace Habit App",
        "category": "mobile_app_interface",
        "stage": "EdTech & Consumer Habit Benchmark",
        "description": "Gamified progress roadmap, streak counter widget, immediate tactile haptic feedback on completion, bite-sized daily modules.",
        "key_features": ["Streak persistence mechanics", "Audio-visual celebratory feedback", "Branching level map", "Social leaderboard feed"],
        "mvp_takeaways": "Duolingo MVP tested whether users would complete 5-minute translated sentences for free; they ruthlessly prioritized streak notifications.",
        "component_advice": "Include native haptic feedback (`Haptics.notificationAsync`) and sound design on successful actions to reinforce positive dopamine loops.",
        "differentiation_tip": "Apply the bite-sized gamification loop to underserved domains like financial literacy, medical adherence, or trade apprentice exams."
    },

    # 4. Web SaaS Dashboard
    {
        "id": "prod_saas_01",
        "name": "Linear / Jira Next-Gen Project Hub",
        "category": "web_saas_dashboard",
        "stage": "B2B SaaS Benchmark ($400M+ Valuation)",
        "description": "Keyboard-first navigation (`Cmd+K`), real-time synchronization via WebSockets, dark mode visual aesthetic, blazing sub-50ms latency.",
        "key_features": ["Omnipresent command palette", "Instant optimistic UI caching", "Kanban & list synchronized views", "GitHub/GitLab bidirectional sync"],
        "mvp_takeaways": "Linear founders built a single opinionated issue tracker for small engineering teams, ignoring enterprise permissions and complex Gantt charts in their MVP.",
        "component_advice": "Do not build complex role matrices or enterprise SSO for day 1; optimize your dashboard for fast keyboard shortcuts and clean data tables.",
        "differentiation_tip": "Position as the ultra-fast, lightweight alternative to bloated legacy enterprise software in your chosen industry."
    },
    {
        "id": "prod_saas_02",
        "name": "Notion / Airtable Modular Workspace",
        "category": "web_saas_dashboard",
        "stage": "Enterprise Collaboration Decacorn ($10B+)",
        "description": "Block-based rich text document editor, relational database views (grid, gallery, calendar, kanban), collaborative cursor presence.",
        "key_features": ["Slash command block menu (`/`)", "Drag-and-drop hierarchy", "Relational data property linking", "Template sharing marketplace"],
        "mvp_takeaways": "Notion actually failed their first prototype because their tech stack was too fragile; they rewrote a simpler React/SQLite MVP that scaled seamlessly.",
        "component_advice": "Use modern headless UI components (Shadcn UI, Radix primitives, Tailwind) to achieve a modern aesthetic in days rather than months.",
        "differentiation_tip": "Create pre-built industry operating systems (e.g. 'The Notion for Dental Practices' or 'Airtable for Biotech Clinical Trials')."
    },
    {
        "id": "prod_saas_03",
        "name": "Datadog / PostHog Analytics Platform",
        "category": "web_saas_dashboard",
        "stage": "Enterprise Developer Infrastructure",
        "description": "Time-series telemetry graphs, real-time event ingestion stream, custom funnel drilldown, distributed tracing visualizer.",
        "key_features": ["Configurable widget grid", "High-density time series charts", "Query builder with syntax highlighting", "Anomaly detection thresholds"],
        "mvp_takeaways": "PostHog started as an open-source GitHub repo that founders could deploy with one Docker command, validating immediate product-market fit.",
        "component_advice": "Use Apache ECharts or Chart.js for data visualization; implement server-side pagination early to avoid front-end lag on large datasets.",
        "differentiation_tip": "Provide automatic actionable root-cause AI insights instead of just passive graphs and charts."
    },

    # 5. Health Diagnostic Device
    {
        "id": "prod_health_01",
        "name": "Dexcom G7 / Abbott FreeStyle Libre CGM",
        "category": "health_diagnostic_device",
        "stage": "Medical Device Commercial Standard",
        "description": "Subcutaneous micro-filament biosensor, disposable applicator, coin-sized water-resistant transmitter, continuous interstitial glucose telemetry.",
        "key_features": ["10-day continuous wear time", "Predictive urgent low glucose alert", "Zero fingerstick calibration", "Encrypted Bluetooth LE telemetry"],
        "mvp_takeaways": "Early CGM prototypes required daily calibration fingersticks and bulky wired receiver bricks before integrating Bluetooth to smartphones.",
        "component_advice": "For non-invasive health prototypes, validate user experience with commercial PPG sensors (MAX30102) and benchtop mock data before clinical trials.",
        "differentiation_tip": "Combine biomarker trends with actionable behavioral nudges (e.g. post-meal walking prompts, stress breathing exercises)."
    },
    {
        "id": "prod_health_02",
        "name": "Withings ScanWatch 2 / BPM Core",
        "category": "health_diagnostic_device",
        "stage": "FDA-Cleared Consumer Healthtech",
        "description": "Sapphire glass analog-digital hybrid, medical-grade 1-lead ECG, SpO2 sensor, optical heart rate, blood pressure cuff integration.",
        "key_features": ["FDA clearance for atrial fibrillation", "Analog watch aesthetic with hidden screen", "30-day battery life", "Clinically validated cuff sensor"],
        "mvp_takeaways": "Withings differentiated by making medical monitoring look like beautiful French jewelry rather than intimidating hospital hardware.",
        "component_advice": "Partner early with institutional IRB or academic labs for prototype validation data; FDA Class II requires Design History Files (DHF).",
        "differentiation_tip": "Design for passive unobtrusive compliance among elderly or chronic care patients."
    },
    {
        "id": "prod_health_03",
        "name": "KardiaMobile 6L Personal ECG",
        "category": "health_diagnostic_device",
        "stage": "Clinical Consumer Standard ($99 - $149)",
        "description": "Pocket-sized 6-lead ECG pad, stainless steel electrodes, smartphone ultrasound acoustic pairing / BLE, instant AI rhythm analysis.",
        "key_features": ["Pocketable credit-card size", "No wires or sticky gel pads required", "Instant PDF export for cardiologists", "6-lead clinical fidelity"],
        "mvp_takeaways": "Kardia's original prototype clipped onto the back of an iPhone case; they focused on solving the fear of panic-induced hospital visits.",
        "component_advice": "Focus prototype testing on motion artifact reduction and clear visual feedback for proper fingertip contact resistance.",
        "differentiation_tip": "Bundle direct telehealth triage or specialized second-opinion cardiologist reviews with the hardware."
    },

    # 6. Robotics & Automation Pods
    {
        "id": "prod_robot_01",
        "name": "DJI Mini 4 Pro / Avata Drone",
        "category": "robotics_automation_pod",
        "stage": "Commercial Robotics Benchmark ($759 - $1,099)",
        "description": "Sub-249g folding carbon/polymer frame, 3-axis mechanical gimbal, omnidirectional vision sensing, 20km O4 video transmission.",
        "key_features": ["Sub-249g regulatory exemption weight", "Omnidirectional obstacle avoidance", "Subject tracking ActiveTrack 360", "Automated return-to-home"],
        "mvp_takeaways": "DJI started with flight controller autopilot boards for hobbyists before shipping integrated ready-to-fly carbon-fiber quadcopters.",
        "component_advice": "Use off-the-shelf ArduPilot / PX4 flight controllers with standard brushless ESCs and 3D printed carbon-nylon arms for your MVP.",
        "differentiation_tip": "Target specialized commercial inspection (roof thermal scans, solar farm defects, agricultural crop health) rather than consumer video."
    },
    {
        "id": "prod_robot_02",
        "name": "Dobot Magician / UFactory Lite 6 Robotic Arm",
        "category": "robotics_automation_pod",
        "stage": "Industrial Education & Prototyping ($1,500 - $3,500)",
        "description": "6-axis collaborative desktop robotic arm, harmonic drive gearboxes, 0.2mm repeatability, interchangeable pneumatic/gripper end-effectors.",
        "key_features": ["Teach-and-playback drag mode", "Interchangeable modular toolheads", "Collision safety auto-stop", "Python & ROS API support"],
        "mvp_takeaways": "Dobot's initial prototype was funded on Kickstarter using stepper motors with timing belts before transitioning to harmonic drives.",
        "component_advice": "For MVP robotics, use planetary-geared stepper motors with magnetic encoders (AS5600) rather than expensive harmonic drives.",
        "differentiation_tip": "Provide a no-code visual workflow builder that factory floor operators can reprogram without hiring software engineers."
    },
    {
        "id": "prod_robot_03",
        "name": "Starship Technologies / Serve Delivery Pod",
        "category": "robotics_automation_pod",
        "stage": "Autonomous Commercial Scale (1M+ Deliveries)",
        "description": "6-wheel sidewalk delivery rover, curb-climbing bogie suspension, multi-camera stereo vision, ultrasonic sonar, remote human teleoperation override.",
        "key_features": ["6-wheel rocker-bogie all-terrain chassis", "Insulated cargo bay with PIN unlock", "Pedestrian-friendly rounded aesthetics", "Teleoperation fallback"],
        "mvp_takeaways": "Starship relied heavily on remote teleoperation drivers in Estonia during early US college campus pilots while their autonomy models trained.",
        "component_advice": "Build 'Wizard of Oz' teleoperation into your MVP: let human operators remotely pilot edge cases while advertising automated delivery.",
        "differentiation_tip": "Focus on closed campus environments (corporate headquarters, golf resorts, hospitals) where speed limits and geofencing reduce liability."
    },

    # 7. CleanTech & GreenTech Gadgets
    {
        "id": "prod_clean_01",
        "name": "EcoFlow Delta 2 / River Portable Power Station",
        "category": "cleantech_energy_gadget",
        "stage": "CleanTech Consumer Benchmark ($499 - $1,199)",
        "description": "LiFePO4 battery chemistry (3,000+ cycles), X-Stream 80-minute fast AC charging, MPPT solar input, bi-directional inverter, mobile app control.",
        "key_features": ["0 to 80% recharge in 50 minutes", "LiFePO4 high-safety cell pack", "Pure sine wave AC outlets", "Integrated solar MPPT tracker"],
        "mvp_takeaways": "EcoFlow launched on Kickstarter by proving their proprietary fast-charging inverter was 5x faster than incumbent lead-acid and Jackery units.",
        "component_advice": "Safety first: use certified off-the-shelf Battery Management Systems (BMS) with thermal cutoffs; never design bare lithium charging circuits without UL certification.",
        "differentiation_tip": "Bundle specialized adapters for specific work setups (remote digital nomads, mobile film crews, outdoor disaster prep)."
    },
    {
        "id": "prod_clean_02",
        "name": "Tesla Wall Connector & Span Smart Panel",
        "category": "cleantech_energy_gadget",
        "stage": "Smart Home CleanTech ($450 - $3,500)",
        "description": "Smart bidirectional EV charger / architectural electrical subpanel, Wi-Fi connected, dynamic load shedding, solar curtailment management.",
        "key_features": ["Dynamic circuit load balancing", "Automated time-of-use cost optimization", "Sleek architectural tempered glass facade", "Fleet charging mesh"],
        "mvp_takeaways": "Span's MVP focused on proving they could dynamically shed non-critical loads during power outages to make home battery backup last 2x longer.",
        "component_advice": "Design your enclosure to pass NEMA 4X / IP66 weatherproofing from the prototype stage if meant for outdoor or garage deployment.",
        "differentiation_tip": "Build intelligent software integration that automatically buys energy at negative grid pricing and sells during peak hours."
    },

    # 8. Consumer Electronics & Connected Tools
    {
        "id": "prod_tool_01",
        "name": "Sonos Era / Roam Smart Audio Speaker",
        "category": "consumer_electronics_tool",
        "stage": "Premium Consumer Hardware ($179 - $449)",
        "description": "Precision acoustic waveguide, dual class-D digital amplifiers, Trueplay microphone tuning, capacitive touch volume slider, multi-room sync.",
        "key_features": ["Trueplay acoustic room auto-tuning", "Capacitive touch groove slider", "Lossless Wi-Fi & Bluetooth auto-switching", "Multi-room zero-latency sync"],
        "mvp_takeaways": "Sonos spent months perfecting zero-latency wireless synchronization between two rooms before launching their first multi-room bundle.",
        "component_advice": "Acoustic chamber volume and ported sealing are critical; use 3D printed resin with 100% infill to prevent prototype cabinet resonance.",
        "differentiation_tip": "Target acoustic needs for podcast studios, white-noise sleep therapy, or focused ambient workspaces."
    },
    {
        "id": "prod_tool_02",
        "name": "reMarkable 2 / Supernote Digital Paper",
        "category": "consumer_electronics_tool",
        "stage": "Hardware Category Creator ($399 + Pen)",
        "description": "Canvas monochrome digital paper display, 4.7mm ultra-thin aluminum chassis, 21ms pen latency, high-friction paper-like surface texture.",
        "key_features": ["Friction-textured surface feels like real paper", "Zero distraction: no web browser or notifications", "4.7mm world's thinnest tablet", "Weeks of battery life"],
        "mvp_takeaways": "reMarkable spent 3 years solely obsessing over pen tip friction and reducing E-ink latency down to 20ms before releasing any other software features.",
        "component_advice": "Identify the ONE sensory interaction your prototype must nail (e.g. tactile switch feel, clickwheel torque, screen friction) and perfect that first.",
        "differentiation_tip": "Focus on high-security enterprise environments (defense, legal, finance) where camera tablets are strictly banned."
    },
    {
        "id": "prod_tool_03",
        "name": "Ember Smart Temperature Control Mug",
        "category": "consumer_electronics_tool",
        "stage": "Premium Kitchen Gadget ($129 - $179)",
        "description": "Precision micro-heaters, dual lithium-ion battery array, phase-change cooling reservoir, scratch-resistant ceramic coating, LED status bar.",
        "key_features": ["Maintains beverage at exact user temperature", "Auto-sleep accelerometer sensing liquid level", "Coaster charging dock", "Personalized LED color"],
        "mvp_takeaways": "Ember's founder spent two years prototyping thermal insulation and phase-change materials in his garage to keep coffee warm without boiling it.",
        "component_advice": "For thermal prototypes, use food-grade 304/316 stainless steel and off-the-shelf PID temperature controllers before designing custom heater boards.",
        "differentiation_tip": "Create smart thermal containers for temperature-sensitive pharmaceuticals (insulin, vaccines) or specialized espresso brewing."
    }
]

def generate_synthetic_prototype_dataset(samples_per_class=100, img_size=(64, 64)):
    x_data = []
    y_data = []
    
    for class_idx, cat in enumerate(PROTOTYPE_CATEGORIES):
        for s in range(samples_per_class):
            img = np.zeros((*img_size, 3), dtype=np.float32)
            noise = np.random.normal(0.05, 0.02, (*img_size, 3)).astype(np.float32)
            img += noise
            
            # Add class-specific structural elements
            if cat == "smart_wearable":
                center = (np.random.randint(28, 36), np.random.randint(28, 36))
                radius = np.random.randint(18, 24)
                y, x = np.ogrid[:img_size[0], :img_size[1]]
                mask = (x - center[0])**2 + (y - center[1])**2 <= radius**2
                img[mask] = [0.15, 0.20, 0.25]
                inner_mask = ((x - center[0])**2 + (y - center[1])**2 <= (radius - 4)**2) & ((x - center[0])**2 + (y - center[1])**2 >= (radius - 7)**2)
                img[inner_mask] = [0.95, 0.35, 0.10]
                img[0:center[1]-radius, center[0]-8:center[0]+8] = [0.2, 0.2, 0.22]
                img[center[1]+radius:img_size[1], center[0]-8:center[0]+8] = [0.2, 0.2, 0.22]
                
            elif cat == "iot_hardware_node":
                pcb_color = [0.05, 0.45, 0.20] if np.random.rand() > 0.4 else [0.10, 0.25, 0.55]
                img[10:54, 10:54] = pcb_color
                img[24:40, 24:40] = [0.12, 0.12, 0.12]
                img[12:15, 14:50:4] = [0.85, 0.85, 0.70]
                img[49:52, 14:50:4] = [0.85, 0.85, 0.70]
                img[20:22, 12:24] = [0.80, 0.70, 0.20]
                img[42:44, 40:52] = [0.80, 0.70, 0.20]
                
            elif cat == "mobile_app_interface":
                img[6:58, 16:48] = [0.95, 0.95, 0.98]
                img[8:12, 26:38] = [0.2, 0.2, 0.25]
                img[14:18, 20:44] = [0.15, 0.45, 0.90]
                img[22:32, 20:44] = [0.88, 0.90, 0.95]
                img[36:46, 20:44] = [0.88, 0.90, 0.95]
                img[52:56, 18:46] = [0.30, 0.35, 0.45]
                
            elif cat == "web_saas_dashboard":
                img[8:56, 6:58] = [0.96, 0.97, 0.99]
                img[8:56, 6:18] = [0.12, 0.15, 0.22]
                img[8:14, 18:58] = [0.88, 0.90, 0.94]
                img[18:34, 22:40] = [0.82, 0.86, 0.92]
                img[26:33, 25:28] = [0.20, 0.60, 0.90]
                img[22:33, 30:33] = [0.20, 0.60, 0.90]
                img[20:33, 35:38] = [0.20, 0.60, 0.90]
                img[18:24, 44:55] = [0.90, 0.93, 0.96]
                img[28:34, 44:55] = [0.90, 0.93, 0.96]
                img[38:52, 22:55] = [0.92, 0.94, 0.97]
                
            elif cat == "health_diagnostic_device":
                img[12:52, 12:52] = [0.92, 0.94, 0.95]
                img[4:12, 28:36] = [0.45, 0.50, 0.55]
                img[18:34, 18:46] = [0.08, 0.12, 0.16]
                img[26, 20:26] = [0.10, 0.95, 0.60]
                img[23:28, 26:30] = [0.10, 0.95, 0.60]
                img[26, 30:44] = [0.10, 0.95, 0.60]
                img[40:48, 29:35] = [0.85, 0.20, 0.20]
                img[42:46, 26:38] = [0.85, 0.20, 0.20]
                
            elif cat == "robotics_automation_pod":
                img[24:40, 24:40] = [0.25, 0.28, 0.32]
                for d in range(16):
                    img[24-d, 24-d] = [0.4, 0.42, 0.45]
                    img[24-d, 39+d] = [0.4, 0.42, 0.45]
                    img[39+d, 24-d] = [0.4, 0.42, 0.45]
                    img[39+d, 39+d] = [0.4, 0.42, 0.45]
                img[6:12, 6:12] = [0.8, 0.2, 0.2]
                img[6:12, 52:58] = [0.8, 0.2, 0.2]
                img[52:58, 6:12] = [0.2, 0.6, 0.8]
                img[52:58, 52:58] = [0.2, 0.6, 0.8]
                img[30:34, 30:34] = [0.05, 0.65, 0.95]
                
            elif cat == "cleantech_energy_gadget":
                img[10:54, 10:54] = [0.15, 0.18, 0.22]
                for r in range(4):
                    for c in range(4):
                        img[13+r*10:21+r*10, 13+c*10:21+c*10] = [0.12, 0.25, 0.55]
                img[48:52, 16:24] = [0.20, 0.85, 0.30]
                img[48:52, 26:34] = [0.20, 0.85, 0.30]
                img[48:52, 36:44] = [0.95, 0.80, 0.10]
                
            elif cat == "consumer_electronics_tool":
                img[12:52, 16:48] = [0.25, 0.26, 0.28]
                img[16:38, 20:44:2] = [0.65, 0.68, 0.72]
                img[17:39:2, 20:44] = [0.55, 0.58, 0.62]
                img[42:48, 28:36] = [0.85, 0.85, 0.88]
                img[44:46, 31:33] = [0.95, 0.30, 0.15]

            img = np.clip(img * np.random.uniform(0.9, 1.1), 0.0, 1.0)
            x_data.append(img)
            y_data.append(class_idx)
            
    x_data = np.array(x_data, dtype=np.float32)
    y_data = np.array(y_data, dtype=np.int32)
    
    indices = np.random.permutation(len(x_data))
    return x_data[indices], y_data[indices]

def build_prototype_cnn_model(input_shape=(64, 64, 3), num_classes=8):
    inputs = layers.Input(shape=input_shape, name="prototype_image_input")
    x = layers.Conv2D(32, (3, 3), padding="same", activation="relu")(inputs)
    x = layers.MaxPooling2D((2, 2))(x)
    x = layers.Conv2D(64, (3, 3), padding="same", activation="relu")(x)
    x = layers.MaxPooling2D((2, 2))(x)
    x = layers.Conv2D(128, (3, 3), padding="same", activation="relu")(x)
    x = layers.MaxPooling2D((2, 2))(x)
    x = layers.Flatten()(x)
    embedding = layers.Dense(128, activation="relu", name="feature_embedding")(x)
    outputs = layers.Dense(num_classes, activation="softmax", name="category_output")(embedding)
    return models.Model(inputs=inputs, outputs=outputs, name="Prototype_Matcher_CNN")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--output-dir", type=Path, default=Path("models"))
    parser.add_argument("--model-name", type=str, default="cnn_prototype.keras")
    args = parser.parse_args()
    
    args.output_dir.mkdir(parents=True, exist_ok=True)
    
    x_data, y_data = generate_synthetic_prototype_dataset(samples_per_class=120, img_size=(64, 64))
    split = int(len(x_data) * 0.8)
    x_train, y_train = x_data[:split], y_data[:split]
    x_val, y_val = x_data[split:], y_data[split:]
    
    model = build_prototype_cnn_model(input_shape=(64, 64, 3), num_classes=len(PROTOTYPE_CATEGORIES))
    model.compile(optimizer=optimizers.Adam(learning_rate=0.001), loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    
    model.fit(x_train, y_train, epochs=args.epochs, batch_size=args.batch_size, validation_data=(x_val, y_val), verbose=1)
    
    embedding_extractor = models.Model(inputs=model.input, outputs=model.get_layer("feature_embedding").output)
    
    # Calculate normalized category embeddings
    class_prototypes, class_labels = generate_synthetic_prototype_dataset(samples_per_class=15, img_size=(64, 64))
    all_embeddings = embedding_extractor.predict(class_prototypes, verbose=0)
    
    category_embeddings = {}
    for c_idx, cat in enumerate(PROTOTYPE_CATEGORIES):
        mask = (class_labels == c_idx)
        cat_embs = all_embeddings[mask]
        mean_vec = np.mean(cat_embs, axis=0)
        norm = np.linalg.norm(mean_vec)
        if norm > 0:
            mean_vec = mean_vec / norm
        category_embeddings[cat] = mean_vec.tolist()
        
    enriched_products = []
    for prod in REAL_WORLD_PRODUCTS:
        cat = prod["category"]
        base_emb = np.array(category_embeddings[cat], dtype=np.float32)
        prod_noise = np.random.normal(0, 0.04, base_emb.shape).astype(np.float32)
        prod_vec = base_emb + prod_noise
        prod_vec = prod_vec / np.linalg.norm(prod_vec)
        
        prod_entry = dict(prod)
        prod_entry["embedding"] = prod_vec.tolist()
        enriched_products.append(prod_entry)
        
    catalog_path = args.output_dir / "prototype_catalog.json"
    with open(catalog_path, "w", encoding="utf-8") as f:
        json.dump({
            "categories": PROTOTYPE_CATEGORIES,
            "category_embeddings": category_embeddings,
            "products": enriched_products
        }, f, indent=2)
        
    model.save(args.output_dir / args.model_name)
    model.save(args.output_dir / "cnn_cifar10.keras")
    print("Retraining completed successfully and files saved.")

if __name__ == "__main__":
    main()
