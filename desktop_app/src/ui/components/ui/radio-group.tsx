import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { CheckCircle } from 'lucide-react';

import { cn } from '@ui/lib/utils';

const RadioGroup = RadioGroupPrimitive.Root;

function RadioGroupItem({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      className={cn(
        'aspect-square h-4 w-4 rounded-full border border-gray-300 text-primary shadow focus:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700',
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <CheckCircle className="h-3.5 w-3.5 fill-primary" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem };
