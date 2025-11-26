# AdSyntheX 

> Advertising Analytics Platform - Unified cost-revenue tracking across Google Ads, AdSense, Ads.com, Compado, and Inuvo

[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![Redis](https://img.shields.io/badge/Redis-Caching-red)](https://redis.io/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Database-green)](https://www.mongodb.com/)

## Overview

AdSyntheX is a production-grade analytics dashboard that combines cost data from Google Ads with revenue data from multiple advertising platforms, providing comprehensive ROI analysis and profitability tracking at the campaign and ad level.

### Key Features

- **Multi-Platform Integration**: Google Ads, AdSense, Ads.com, Compado, Inuvo
- **Real-Time Cost-Revenue Matching**: GCLID/TKID correlation for accurate profit tracking
- **Advanced Caching**: Multi-tier Redis/MongoDB caching with GZIP compression
- **Intelligent Rate Limiting**: Smart quota management to prevent API exhaustion
- **Account-Based Access Control**: Multi-tenant support with feed-level permissions
- **Comprehensive Metrics**: ROI, ROAS, CPA, conversion rates, CTR, and more

## Quick Start

```bash
# Clone repository
git clone https://github.com/nagdewaniharen/AdSyntheX.git
cd AdSyntheX

# Install dependencies
npm install

# Setup environment variables (see docs/QUICK_START.md)
cp .env.example .env.local

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Documentation

Comprehensive documentation is available in the [`docs/`](./docs) folder:

- **[Quick Start Guide](./docs/QUICK_START.md)** - Installation and setup
- **[Architecture](./docs/ARCHITECTURE.md)** - System design and patterns
- **[API Integrations](./docs/)** - Google Ads, AdSense, Compado, Inuvo docs
- **[Deployment Guide](./docs/PRODUCTION_DEPLOYMENT.md)** - Production deployment
- **[Local Testing](./docs/LOCAL_TESTING_GUIDE.md)** - Development guide
- **[Troubleshooting](./docs/COOLDOWN_GUIDE.md)** - Common issues

## Technology Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript 5.3
- **UI**: Ant Design + TailwindCSS
- **Caching**: Redis (Upstash) + MongoDB
- **APIs**: Google Ads API, AdSense API, Ads.com, Compado, Inuvo

## Architecture Highlights

### Multi-Tier Caching Strategy
```
Memory Cache (1-5 min) → Redis Cache (5-15 min) → MongoDB (warm storage) → Live API
```

### Performance Optimizations
- **GZIP compression**: ~70% bandwidth reduction
- **Stale-While-Revalidate**: Instant responses while refreshing
- **Background cache warmup**: Predictive query caching
- **Smart rate limiting**: Distributed quota tracking

### Security Features
- Account-based access control
- Feed-level permissions
- API key authentication
- Session management

## Project Structure

```
AdSyntheX/
├── app/                    # Next.js App Router
│   ├── api/                # API routes
│   └── dashboard/          # Dashboard pages
├── components/             # React components
├── lib/                    # Core libraries
│   ├── google-ads-api.ts   # Google Ads integration
│   ├── compado-api.ts      # Compado integration
│   └── redis-cache-manager.ts  # Caching layer
├── docs/                   # Documentation
└── scripts/                # Utility scripts
```

## Development

```bash
# Development server
npm run dev

# TypeScript check
npm run build

# Clean cache
npm run clean

# Verify system
npm run verify

# Check API quota
npm run check-quota
```

## Deployment

Supports deployment on:
- **Vercel** (recommended for Next.js)
- **Render** (with worker for background jobs)
- **Any Node.js hosting** (18.x+)

See [Production Deployment Guide](./docs/PRODUCTION_DEPLOYMENT.md) for details.

## Environment Variables

Required environment variables:
- Google Ads API credentials
- AdSense API credentials  
- Redis (Upstash) connection
- MongoDB connection
- Admin login key

See [`.env.example`](./docs/QUICK_START.md#environment-variables) for full list.

## License

MIT License - See [LICENSE](LICENSE) file for details

## Support

- **Documentation**: Check [`docs/`](./docs) folder
- **Issues**: Open a GitHub issue
- **Questions**: Review [troubleshooting guide](./docs/COOLDOWN_GUIDE.md)

---

**Built with ❤️ for advertising analytics**