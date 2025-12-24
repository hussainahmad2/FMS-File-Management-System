import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertFolderSchema, CreateFolderRequest } from "@shared/schema";
import { useCreateFolder } from "@/hooks/use-fs";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FolderPlus } from "lucide-react";

type Props = {
  parentId?: number;
};

export function CreateFolderDialog({ parentId }: Props) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const createFolder = useCreateFolder();

  const form = useForm<CreateFolderRequest>({
    resolver: zodResolver(insertFolderSchema),
    defaultValues: {
      name: "",
      parentId: parentId || null,
      ownerId: user?.id,
    },
  });

  function onSubmit(data: CreateFolderRequest) {
    createFolder.mutate(
      { ...data, ownerId: user!.id, parentId: parentId || null },
      {
        onSuccess: () => {
          setOpen(false);
          form.reset();
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <FolderPlus className="w-4 h-4" />
          New Folder
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Folder</DialogTitle>
          <DialogDescription>
            Enter a name for the new folder.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Project X Documents" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={createFolder.isPending}>
                {createFolder.isPending ? "Creating..." : "Create Folder"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
