# AdSyntheX Dashboard

AdSyntheX is a powerful analytics dashboard that combines revenue data from Ads.com with cost data from Google Ads, providing a comprehensive view of your marketing performance.

## Features

- Combined revenue and cost data in a single dashboard
- Detailed metrics analysis with conversion rates, CTR, CPA, and more
- Interactive date range selection
- URL slug matching for correlating ad performance with revenue
- Country-specific performance breakdown
- Responsive design for all devices

## Tech Stack

- Next.js 14
- TypeScript
- Ant Design (UI components)
- Google Ads API integration
- Ads.com API integration

## Getting Started

### Prerequisites

- Node.js 18.x or later
- npm or yarn
- Google Ads API credentials
- Ads.com API credentials

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/nagdewaniharen/AdSyntheX.git
   cd AdSyntheX
   ```

2. Install dependencies:
   ```
   npm install
   ```
   or
   ```
   yarn install
   ```

3. Create an `.env.local` file in the root directory with your API credentials:
   ```
   # Google Ads API
   GOOGLE_ADS_CLIENT_ID=your_client_id
   GOOGLE_ADS_CLIENT_SECRET=your_client_secret
   GOOGLE_ADS_DEVELOPER_TOKEN=your_developer_token
   GOOGLE_ADS_REFRESH_TOKEN=your_refresh_token
   GOOGLE_ADS_MANAGER_ID=your_manager_id
   
   # Ads.com API
   ADSCOM_API_KEY=your_api_key
   ADSCOM_API_SECRET=your_api_secret
   ```

### Running the development server

```
npm run dev
```
or
```
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the result.

### Building for production

```
npm run build
```
or
```
yarn build
```

## Deployment

The application can be deployed on platforms like Vercel, Netlify, or Render:

1. Configure environment variables on your hosting platform
2. Connect your GitHub repository
3. Deploy from main branch

## License

[MIT](LICENSE) 