# 📚 AdSyntheX Documentation

---

## 📖 Documentation Index

### Essential Documentation (Read These)

1. **[PROJECT_GUIDE.md](./PROJECT_GUIDE.md)** - Start Here!
   - Quick start & installation
   - Project structure
   - Code examples
   - Configuration
   - Troubleshooting

2. **[API_REFERENCE.md](./API_REFERENCE.md)** - API Documentation
   - All endpoints with examples
   - Request/response formats
   - Error codes
   - Testing examples

3. **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Architecture Guide
   - Clean architecture overview
   - Layer responsibilities
   - Data flow
   - Design patterns
   - Architecture decisions

4. **[onboarding.md](./onboarding.md)** - Developer Onboarding
   - Setup instructions
   - Environment configuration
   - First-time setup guide

---

## 🚀 Quick Links

### For New Developers
1. Read **PROJECT_GUIDE.md** (5 min)
2. Follow **onboarding.md** (10 min)
3. Explore **API_REFERENCE.md** as needed

### For Understanding Architecture
1. Read **ARCHITECTURE.md** (10 min)
2. Check `src/domain/` for business logic
3. Check `src/infrastructure/` for implementations

### For API Integration
1. Read **API_REFERENCE.md**
2. Test endpoints with cURL examples
3. Check error handling section

---

## 🎯 What's New in v2.0

### ✅ Clean Architecture Implemented
- Domain layer with pure business logic
- Infrastructure layer for external systems
- Clear separation of concerns
- Improved testability

### ✅ Better Code Organization
- From 5 cache implementations → 1 unified
- From 3 API routes → 1 production route
- Max file size: ~250 lines (was 1,369)
- Business logic centralized in domain

### ✅ Professional Documentation
- 3 essential guides (vs 15+ scattered docs)
- Clear examples and code samples
- Architecture diagrams
- API reference with cURL examples

---

## 📁 Project Structure Overview

```
AdSyntheX/
├── src/
│   ├── domain/              # Business Logic (Pure)
│   ├── infrastructure/      # External Systems
│   └── shared/              # Common Utilities
├── app/api/                 # Next.js API Routes
├── components/              # React Components
├── lib/                     # Legacy (being phased out)
└── docs/                    # This documentation
```

---

## 🤝 Contributing to Docs

### When to Update Docs
- Added new API endpoint → Update **API_REFERENCE.md**
- Changed architecture → Update **ARCHITECTURE.md**
- Added configuration → Update **PROJECT_GUIDE.md**
- Changed setup → Update **onboarding.md**

### Documentation Style
- ✅ Be concise and practical
- ✅ Include code examples
- ✅ Use diagrams where helpful
- ✅ Keep examples copy-pasteable
- ❌ Avoid long prose
- ❌ Don't duplicate information

---

## 📝 Documentation Standards

### Format
- Use Markdown
- Include table of contents for long docs
- Use code blocks with language tags
- Add emojis for quick scanning (sparingly)

### Code Examples
```typescript
// ✅ Good: Complete, runnable example
import { Ad } from '@/src/domain/entities/Ad';
const ad = new Ad(/*...*/);
console.log(ad.slug);

// ❌ Bad: Incomplete snippet
const ad = new Ad();
```

---

## 🔗 External Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Google Ads API](https://developers.google.com/google-ads/api/docs)
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)

---

**Questions?** Check the guides above or contact the development team.
