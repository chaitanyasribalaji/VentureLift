#!/usr/bin/env python3
"""
Market trend analysis using Google Trends data.
Analyzes market demand for venture sectors and specific keywords.
"""

import json
import sys
from datetime import datetime, timedelta
from pytrends.request import TrendReq


def get_market_trends(sector, keywords, timeframe="today 3-m"):
    """
    Fetch Google Trends data for market analysis.
    
    Args:
        sector: Industry sector (e.g., "fintech", "healthtech")
        keywords: List of keywords to analyze (e.g., ["fintech", "lending", "payments"])
        timeframe: Google Trends timeframe (default: last 3 months)
    
    Returns:
        dict with trend data and market insights
    """
    try:
        pytrends = TrendReq(hl='en-US', tz=360)
        
        # Fetch interest over time
        pytrends.build_request(keywords, cat=0, timeframe=timeframe, geo='', gprop='')
        interest_over_time = pytrends.interest_over_time()
        
        if interest_over_time.empty:
            return {"error": "No trend data available", "keywords": keywords}
        
        # Calculate trend metrics
        latest_interest = interest_over_time.iloc[-1].to_dict()
        avg_interest = interest_over_time[keywords].mean().to_dict()
        trend_direction = "rising" if interest_over_time[keywords[0]].iloc[-1] > interest_over_time[keywords[0]].iloc[0] else "declining"
        
        # Get related queries
        pytrends.build_request([keywords[0]], cat=0, timeframe=timeframe, geo='', gprop='')
        related_queries = pytrends.related_queries()
        top_queries = related_queries.get(keywords[0], {}).get("top", [])
        
        return {
            "sector": sector,
            "keywords": keywords,
            "latest_interest": latest_interest,
            "average_interest": avg_interest,
            "trend_direction": trend_direction,
            "peak_interest": float(interest_over_time[keywords].max().max()),
            "top_related_queries": top_queries.head(5)["query"].tolist() if not top_queries.empty else [],
            "data_points": len(interest_over_time),
            "timeframe": timeframe,
            "last_updated": datetime.now().isoformat(),
        }
    except Exception as e:
        return {
            "error": str(e),
            "keywords": keywords,
            "sector": sector,
        }


def analyze_venture_market_fit(venture_name, sector, problem, keywords=None):
    """
    Analyze market fit for a venture using trend data.
    
    Args:
        venture_name: Name of the venture
        sector: Industry sector
        problem: Problem statement
        keywords: Custom keywords to analyze (optional)
    
    Returns:
        dict with market analysis and score
    """
    if not keywords:
        keywords = [sector.lower(), problem.lower().split()[0], venture_name.lower()]
        keywords = [k for k in keywords if len(k) > 3][:3]
    
    trends_data = get_market_trends(sector, keywords[:3])
    
    if "error" in trends_data:
        return {
            "venture": venture_name,
            "sector": sector,
            "market_score": 50,
            "market_fit": "unknown",
            "trends": trends_data,
            "note": "Market data unavailable - using default score",
        }
    
    # Calculate market fit score (0-100)
    avg_interest = sum(trends_data["average_interest"].values()) / len(trends_data["average_interest"])
    peak_interest = trends_data["peak_interest"]
    
    # Score based on interest levels and trend direction
    market_score = int(avg_interest * 0.7 + (peak_interest * 0.3))
    
    if trends_data["trend_direction"] == "rising":
        market_score = min(100, market_score + 15)
        market_fit = "strong"
    else:
        market_fit = "moderate" if market_score >= 50 else "weak"
    
    return {
        "venture": venture_name,
        "sector": sector,
        "market_score": market_score,
        "market_fit": market_fit,
        "trend_direction": trends_data["trend_direction"],
        "average_interest": round(avg_interest, 2),
        "peak_interest": round(peak_interest, 2),
        "top_related": trends_data["top_related_queries"],
        "keywords_analyzed": trends_data["keywords"],
        "last_updated": trends_data["last_updated"],
        "insights": generate_insights(market_score, trends_data["trend_direction"]),
    }


def generate_insights(market_score, trend_direction):
    """Generate market insights based on score and trends."""
    insights = []
    
    if market_score >= 75:
        insights.append(f"🔥 High market demand - {trend_direction} trend indicates strong market fit")
    elif market_score >= 50:
        insights.append(f"📈 Moderate market interest - {trend_direction} trend suggests growing opportunity")
    else:
        insights.append(f"⚠️  Low market demand - {trend_direction} trend indicates niche or emerging market")
    
    if trend_direction == "rising":
        insights.append("✅ Market interest is growing - timing may be favorable")
    else:
        insights.append("⏸️  Market interest is stable/declining - consider differentiation")
    
    return insights


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(json.dumps({
            "error": "Usage: market_trends.py <venture_name> <sector> <problem_keywords>"
        }))
        sys.exit(1)
    
    venture = sys.argv[1]
    sector = sys.argv[2]
    problem = sys.argv[3]
    keywords = sys.argv[4:5] if len(sys.argv) > 4 else None
    
    result = analyze_venture_market_fit(venture, sector, problem, keywords)
    print(json.dumps(result, indent=2, default=str))
