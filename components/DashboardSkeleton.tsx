'use client';

import React from 'react';
import { Card, Row, Col, Skeleton } from 'antd';

interface SkeletonCardProps {
    height?: number;
}

export const SkeletonStatCard: React.FC<SkeletonCardProps> = ({ height = 100 }) => (
    <Card style={{ height }}>
        <Skeleton active paragraph={{ rows: 1 }} />
    </Card>
);

export const SkeletonSummaryCards: React.FC = () => (
    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
            <Col key={i} xs={24} sm={12} lg={6} xl={4}>
                <SkeletonStatCard />
            </Col>
        ))}
    </Row>
);

export const SkeletonTable: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
    <Card>
        <Skeleton active paragraph={{ rows: 1 }} style={{ marginBottom: 24 }} />
        {Array.from({ length: rows }).map((_, i) => (
            <div key={i} style={{ marginBottom: 16, display: 'flex', gap: 16 }}>
                <Skeleton.Input active style={{ width: 150 }} />
                <Skeleton.Input active style={{ width: 100 }} />
                <Skeleton.Input active style={{ width: 100 }} />
                <Skeleton.Input active style={{ width: 100 }} />
                <Skeleton.Input active style={{ width: 80 }} />
            </div>
        ))}
    </Card>
);

export const DashboardSkeleton: React.FC = () => (
    <>
        <SkeletonSummaryCards />
        <SkeletonTable rows={8} />
    </>
);

interface CacheIndicatorProps {
    isFromCache: boolean;
    isRefreshing: boolean;
    cacheAge: number | null;
}

export const CacheIndicator: React.FC<CacheIndicatorProps> = ({
    isFromCache,
    isRefreshing,
    cacheAge,
}) => {
    if (!isFromCache && !isRefreshing) return null;

    const formatAge = (seconds: number | null): string => {
        if (seconds === null) return '';
        if (seconds < 60) return `${seconds}s ago`;
        if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
        return `${Math.round(seconds / 3600)}h ago`;
    };

    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 11,
                lineHeight: 1.2,
                fontWeight: 500,
                background: isRefreshing ? '#e6f7ff' : '#f6ffed',
                color: isRefreshing ? '#1890ff' : '#52c41a',
                border: `1px solid ${isRefreshing ? '#91d5ff' : '#b7eb8f'}`,
                whiteSpace: 'nowrap',
            }}
        >
            {isRefreshing ? (
                <>
                    <span
                        style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: '#1890ff',
                            animation: 'cacheIndicatorBlink 1s infinite',
                        }}
                    />
                    Refreshing...
                </>
            ) : (
                <>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#52c41a' }} />
                    Cached {formatAge(cacheAge)}
                </>
            )}
            <style>{`
                @keyframes cacheIndicatorBlink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.3; }
                }
            `}</style>
        </span>
    );
};

export default DashboardSkeleton;
