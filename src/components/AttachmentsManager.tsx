import React, { useState, useEffect, useRef } from 'react';
import { Attachment } from '../types';
import { Paperclip, Trash2, Download, Eye, X, Upload, Image as ImageIcon, FileText, MessageSquare, Check } from 'lucide-react';

interface AttachmentsManagerProps {
  entityType: 'upd' | 'act';
  entityId: string;
  readOnly?: boolean;
  onAttachmentsChange?: () => void;
}

export function AttachmentsManager({ entityType, entityId, readOnly = false, onAttachmentsChange }: AttachmentsManagerProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [previewData, setPreviewData] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState<string>('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAttachments = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/attachments/${entityType}/${entityId}`);
      if (response.ok) {
        const data = await response.json();
        setAttachments(data);
      }
    } catch (error) {
      console.error('Failed to fetch attachments:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (entityId) {
      fetchAttachments();
    }
  }, [entityType, entityId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    
    try {
      let uploadedCount = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Validate file type
        const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        if (!validTypes.includes(file.type)) {
          alert(`Файл ${file.name} имеет неподдерживаемый формат. Разрешены JPG, PNG, WEBP и PDF.`);
          continue;
        }

        // Validate file size (e.g., max 5MB)
        if (file.size > 5 * 1024 * 1024) {
          alert(`Файл ${file.name} слишком большой. Максимальный размер 5 МБ.`);
          continue;
        }

        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            if (!result || result.length < 10) {
              reject(new Error('Ошибка чтения файла: пустой результат'));
            } else {
              resolve(result);
            }
          };
          reader.onerror = () => reject(new Error('Ошибка при чтении файла'));
          reader.readAsDataURL(file);
        });

        if (!base64) {
          throw new Error('Не удалось получить данные файла');
        }

        const newAttachment = {
          id: crypto.randomUUID(),
          entityType,
          entityId,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          data: base64,
          uploadedBy: 'User' // Default value
        };

        console.log(`Uploading file ${file.name}, data length: ${base64.length}`);

        const response = await fetch('/api/attachments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newAttachment)
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Upload failed for ${file.name}:`, errorText);
          throw new Error(`Failed to upload ${file.name}: ${errorText}`);
        }
        uploadedCount++;
      }
      
      if (uploadedCount > 0) {
        await fetchAttachments();
        if (onAttachmentsChange) {
          onAttachmentsChange();
        }
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Произошла ошибка при загрузке файлов');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSaveComment = async (id: string) => {
    try {
      const response = await fetch(`/api/attachments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: commentText })
      });
      
      if (response.ok) {
        setAttachments(prev => prev.map(a => a.id === id ? { ...a, comment: commentText } : a));
        setEditingCommentId(null);
      } else {
        throw new Error('Failed to update comment');
      }
    } catch (error) {
      console.error('Update comment error:', error);
      alert('Ошибка при сохранении комментария');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/attachments/${id}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        setAttachments(prev => prev.filter(a => a.id !== id));
        if (onAttachmentsChange) {
          onAttachmentsChange();
        }
        setDeletingId(null);
      } else {
        alert('Не удалось удалить файл');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Ошибка при удалении файла');
    }
  };

  const handlePreview = async (attachment: Attachment) => {
    try {
      console.log('Fetching preview for attachment:', attachment.id);
      const response = await fetch(`/api/attachments/${attachment.id}/download`);
      if (response.ok) {
        const result = await response.json();
        console.log('Preview data received, has data:', !!result.data, 'type:', typeof result.data, 'length:', result.data?.length);
        
        if (!result.data || result.data.length < 10) {
          alert('Данные файла отсутствуют или повреждены. Пожалуйста, удалите файл и загрузите его заново.');
          return;
        }

        if (attachment.fileType === 'application/pdf') {
          // For PDF, create a blob URL for better compatibility
          // Check if it's a data URL or raw base64
          const base64Data = result.data.includes(',') ? result.data.split(',')[1] : result.data;
          
          try {
            const binaryString = window.atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            setPreviewData(url);
          } catch (e) {
            console.error('Base64 decode error:', e);
            throw new Error('Ошибка декодирования PDF файла');
          }
        } else {
          setPreviewData(result.data);
        }
        
        setPreviewAttachment(attachment);
      } else {
        const err = await response.json();
        throw new Error(err.detail || 'Failed to load preview');
      }
    } catch (error) {
      console.error('Preview error:', error);
      // alert is unreliable in iframes
    }
  };

  const closePreview = () => {
    if (previewAttachment?.fileType === 'application/pdf' && previewData) {
      URL.revokeObjectURL(previewData);
    }
    setPreviewAttachment(null);
    setPreviewData(null);
  };

  const handleDownload = async (attachment: Attachment) => {
    try {
      const response = await fetch(`/api/attachments/${attachment.id}/download`);
      if (response.ok) {
        const result = await response.json();
        if (!result.data) {
          alert('Данные файла отсутствуют. Пожалуйста, удалите файл и загрузите его заново.');
          return;
        }
        const link = document.createElement('a');
        link.href = result.data;
        link.download = result.fileName || attachment.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        console.error('Failed to download attachment');
      }
    } catch (error) {
      console.error('Download error:', error);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const isImage = (type: string) => type.startsWith('image/');

  return (
    <div className="mt-6 border-t pt-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900 flex items-center">
          <Paperclip className="w-5 h-5 mr-2 text-gray-500" />
          Подтверждающие материалы
        </h3>
        {!readOnly && (
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              multiple
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || !entityId}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
            >
              <Upload className="w-4 h-4 mr-2" />
              {uploading ? 'Загрузка...' : 'Добавить файлы'}
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-4 text-gray-500">Загрузка материалов...</div>
      ) : attachments.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <ImageIcon className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-sm text-gray-500">Подтверждающие материалы не загружены</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="relative group border rounded-lg p-3 hover:shadow-md transition-shadow bg-white flex flex-col">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center truncate">
                  {isImage(attachment.fileType) ? (
                    <ImageIcon className="w-5 h-5 text-blue-500 mr-2 flex-shrink-0" />
                  ) : (
                    <FileText className="w-5 h-5 text-red-500 mr-2 flex-shrink-0" />
                  )}
                  <span className="text-sm font-medium text-gray-900 truncate" title={attachment.fileName}>
                    {attachment.fileName}
                  </span>
                </div>
              </div>
              <div className="text-xs text-gray-500 mb-3">
                {formatFileSize(attachment.fileSize)} • {new Date(attachment.uploadedAt || '').toLocaleDateString('ru-RU')}
              </div>
              
              <div className="mb-3 flex-1">
                {editingCommentId === attachment.id ? (
                  <div className="flex items-center">
                    <input
                      type="text"
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      className="flex-1 text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Комментарий..."
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveComment(attachment.id);
                        if (e.key === 'Escape') setEditingCommentId(null);
                      }}
                    />
                    <button
                      onClick={() => handleSaveComment(attachment.id)}
                      className="ml-2 p-1 text-green-600 hover:bg-green-50 rounded"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEditingCommentId(null)}
                      className="ml-1 p-1 text-gray-400 hover:bg-gray-50 rounded"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-start justify-between group/comment">
                    <p className="text-sm text-gray-600 italic line-clamp-2" title={attachment.comment}>
                      {attachment.comment || <span className="text-gray-400">Нет комментария</span>}
                    </p>
                    {!readOnly && (
                      <button
                        onClick={() => {
                          setEditingCommentId(attachment.id);
                          setCommentText(attachment.comment || '');
                        }}
                        className="p-1 text-gray-400 hover:text-blue-600 opacity-0 group-hover/comment:opacity-100 transition-opacity"
                        title="Редактировать комментарий"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-auto flex justify-between items-center pt-2 border-t">
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => handlePreview(attachment)}
                    className="p-1 text-gray-500 hover:text-blue-600 rounded hover:bg-blue-50 transition-colors"
                    title="Просмотр"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload(attachment)}
                    className="p-1 text-gray-500 hover:text-green-600 rounded hover:bg-green-50 transition-colors"
                    title="Скачать"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
                {!readOnly && (
                  <div className="flex items-center space-x-1">
                    {deletingId === attachment.id ? (
                      <div className="flex items-center bg-red-50 rounded px-1">
                        <span className="text-[10px] text-red-600 font-bold mr-1">Удалить?</span>
                        <button
                          onClick={() => handleDelete(attachment.id)}
                          className="p-1 text-red-600 hover:bg-red-100 rounded"
                          title="Подтвердить удаление"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
                          className="p-1 text-gray-500 hover:bg-gray-100 rounded"
                          title="Отмена"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeletingId(attachment.id)}
                        className="p-1 text-gray-500 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                        title="Удалить"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview Modal */}
      {previewAttachment && previewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4" onClick={closePreview}>
          <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-medium text-gray-900 truncate pr-4">
                {previewAttachment.fileName}
              </h3>
              <button
                onClick={closePreview}
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-4 overflow-auto flex-1 flex items-center justify-center bg-gray-100">
              {isImage(previewAttachment.fileType) ? (
                <img 
                  src={previewData} 
                  alt={previewAttachment.fileName} 
                  className="max-w-full max-h-full object-contain"
                />
              ) : previewAttachment.fileType === 'application/pdf' ? (
                <iframe 
                  src={previewData} 
                  className="w-full h-[70vh]" 
                  title={previewAttachment.fileName}
                />
              ) : (
                <div className="text-center text-gray-500">
                  <FileText className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                  <p>Предпросмотр недоступен для этого типа файла.</p>
                  <button
                    onClick={() => handleDownload(previewAttachment)}
                    className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Скачать файл
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
