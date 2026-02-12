import { ReactNode } from 'react';
import { useCompany } from '@/features/revendedora/contexts/CompanyContext';

interface ResellerContentWrapperProps {
    children: ReactNode;
}

export function ResellerContentWrapper({ children }: ResellerContentWrapperProps) {
    const { loading } = useCompany();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="flex-1 p-6">
            {children}
        </div>
    );
}
