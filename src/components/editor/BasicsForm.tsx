"use client";

import { useRef } from "react";
import { useResumeStore } from "@/store/useResumeStore";
import { fileToAvatar } from "@/lib/image";
import { uid } from "@/lib/utils";
import { Button, Field, TextInput } from "@/components/ui";
import { Icon } from "@/components/icons";

type BasicField = "name" | "jobTitle" | "phone" | "email" | "city";

export function BasicsForm() {
  const doc = useResumeStore((state) => state.doc);
  const update = useResumeStore((state) => state.update);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!doc) return null;
  const { basics } = doc;

  const setField = (field: BasicField, value: string) =>
    update((draft) => {
      draft.basics[field] = value;
    }, `basics.${field}`);

  const patchLink = (
    id: string,
    patch: Partial<{ label: string; url: string }>,
    key: string,
  ) =>
    update((draft) => {
      const link = draft.basics.links.find((item) => item.id === id);
      if (link) Object.assign(link, patch);
    }, key);

  const addLink = () =>
    update((draft) => {
      draft.basics.links.push({ id: uid("link"), label: "", url: "" });
    });

  const removeLink = (id: string) =>
    update((draft) => {
      draft.basics.links = draft.basics.links.filter((item) => item.id !== id);
    });

  const onPickAvatar = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await fileToAvatar(file);
      update((draft) => {
        draft.basics.avatar = dataUrl;
      });
    } catch (error) {
      window.alert((error as Error).message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-50 text-[10px] text-slate-400">
          {basics.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={basics.avatar} alt="头像" className="h-full w-full object-cover" />
          ) : (
            "头像"
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              void onPickAvatar(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <Button size="sm" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={13} />
            上传
          </Button>
          {basics.avatar ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                update((draft) => {
                  draft.basics.avatar = undefined;
                })
              }
            >
              移除
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Field label="姓名">
          <TextInput
            value={basics.name}
            placeholder="张三"
            onChange={(event) => setField("name", event.target.value)}
          />
        </Field>
        <Field label="求职意向">
          <TextInput
            value={basics.jobTitle}
            placeholder="前端开发工程师"
            onChange={(event) => setField("jobTitle", event.target.value)}
          />
        </Field>
        <Field label="手机">
          <TextInput
            value={basics.phone}
            placeholder="138-0000-0000"
            onChange={(event) => setField("phone", event.target.value)}
          />
        </Field>
        <Field label="邮箱">
          <TextInput
            value={basics.email}
            placeholder="name@example.com"
            onChange={(event) => setField("email", event.target.value)}
          />
        </Field>
        <Field label="所在城市">
          <TextInput
            value={basics.city}
            placeholder="上海"
            onChange={(event) => setField("city", event.target.value)}
          />
        </Field>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-medium text-slate-500">链接</span>
          <Button size="sm" variant="ghost" onClick={addLink}>
            <Icon name="plus" size={13} />
            添加
          </Button>
        </div>
        <div className="space-y-2">
          {basics.links.map((link) => (
            <div key={link.id} className="flex items-center gap-1.5">
              <TextInput
                value={link.label}
                placeholder="GitHub"
                className="w-[34%]"
                onChange={(event) =>
                  patchLink(link.id, { label: event.target.value }, `link.label.${link.id}`)
                }
              />
              <TextInput
                value={link.url}
                placeholder="github.com/you"
                onChange={(event) =>
                  patchLink(link.id, { url: event.target.value }, `link.url.${link.id}`)
                }
              />
              <Button
                size="icon"
                variant="ghost"
                aria-label="删除链接"
                onClick={() => removeLink(link.id)}
              >
                <Icon name="x" size={14} />
              </Button>
            </div>
          ))}
          {basics.links.length === 0 ? (
            <p className="text-[11px] text-slate-400">可添加 GitHub、作品集、博客等链接</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
