import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UploadOptions {
    bucket: string;
    folder?: string;
    maxSizeMB?: number;
}

export function useImageUpload() {
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);

    const uploadImage = async (file: File, options: { bucket: string; folder?: string; maxSizeMB?: number }): Promise<string | null> => {
        const { bucket, folder = '', maxSizeMB = 5 } = options;

        if (!file) return null;

        if (file.size > maxSizeMB * 1024 * 1024) {
            toast.error(`A imagem deve ter no máximo ${maxSizeMB}MB`);
            return null;
        }

        setUploading(true);
        setProgress(0);

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random().toString(36).substring(2, 15)}-${Date.now()}.${fileExt}`;
            const filePath = folder ? `${folder}/${fileName}` : fileName;

            const { error: uploadError } = await supabase.storage
                .from(bucket)
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: false,
                });

            if (uploadError) {
                throw uploadError;
            }

            const { data } = supabase.storage
                .from(bucket)
                .getPublicUrl(filePath);

            return data.publicUrl;
        } catch (error: any) {
            console.error('Erro no upload:', error);
            toast.error('Erro ao fazer upload da imagem');
            return null;
        } finally {
            setUploading(false);
            setProgress(100);
        }
    };

    const deleteImage = async (pathOrUrl: string, bucket: string): Promise<boolean> => {
        setUploading(true);
        try {
            // Extract path from URL if needed, or assume it's a path
            // Simple implementation: assume we receive the full URL and need to extract the path
            // This might need adjustment based on how Supabase URLs are structured in this project
            const url = new URL(pathOrUrl);
            const path = url.pathname.split(`/storage/v1/object/public/${bucket}/`)[1];

            if (!path) {
                // Fallback if path parsing fails or if input was already a path
                console.warn('Could not extract path from URL, assuming input is path:', pathOrUrl);
                // If it's a full URL but we failed to parse, we probably shouldn't try to delete it as a path blindly
                // But for now let's try strict parsing
                return false;
            }

            const { error } = await supabase.storage
                .from(bucket)
                .remove([path]);

            if (error) throw error;

            return true;
        } catch (error) {
            console.error('Erro ao deletar imagem:', error);
            return false;
        } finally {
            setUploading(false);
        }
    };

    return {
        uploadImage,
        deleteImage,
        uploading,
        progress
    };
}
