import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Image Serving" },
    { name: "description", content: "Simple image serving service" },
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  return {
    message: 'Server is running, secure image serving with upload functionality',
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Image Serving</h1>
        <p className="text-gray-700 mb-6">
          {loaderData.message}
        </p>
        
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Basic Usage:</h2>
            <p className="text-sm text-gray-600 mb-2">
              <code className="bg-gray-200 px-2 py-1 rounded text-gray-800">
                /image.png
              </code>
            </p>
            <p className="text-xs text-gray-500">
              Access files directly by their filename.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Image Transformations:</h2>
            <div className="space-y-2 text-sm">
              <div>
                <code className="bg-gray-200 px-2 py-1 rounded text-xs text-gray-800">
                  /image.jpg?size=thumb
                </code>
                <span className="text-gray-600 ml-2">Thumbnail (150x150)</span>
              </div>
              <div>
                <code className="bg-gray-200 px-2 py-1 rounded text-xs text-gray-800">
                  /image.jpg?size=small
                </code>
                <span className="text-gray-600 ml-2">Small (300x300 max)</span>
              </div>
              <div>
                <code className="bg-gray-200 px-2 py-1 rounded text-xs text-gray-800">
                  /image.jpg?size=medium
                </code>
                <span className="text-gray-600 ml-2">Medium (600x600 max)</span>
              </div>
              <div>
                <code className="bg-gray-200 px-2 py-1 rounded text-xs text-gray-800">
                  /image.jpg?size=large
                </code>
                <span className="text-gray-600 ml-2">Large (1200x1200 max)</span>
              </div>
              <div>
                <code className="bg-gray-200 px-2 py-1 rounded text-xs text-gray-800">
                  /image.jpg?size=800x600
                </code>
                <span className="text-gray-600 ml-2">Custom size</span>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Advanced Parameters:</h2>
            <div className="space-y-2 text-sm">
              <div>
                <code className="bg-gray-200 px-2 py-1 rounded text-xs text-gray-800">
                  /image.jpg?width=400
                </code>
                <span className="text-gray-600 ml-2">Specific width</span>
              </div>
              <div>
                <code className="bg-gray-200 px-2 py-1 rounded text-xs text-gray-800">
                  /image.jpg?height=300
                </code>
                <span className="text-gray-600 ml-2">Specific height</span>
              </div>
              <div>
                <code className="bg-gray-200 px-2 py-1 rounded text-xs text-gray-800">
                  /image.jpg?quality=80
                </code>
                <span className="text-gray-600 ml-2">Quality (1-100)</span>
              </div>
              <div>
                <code className="bg-gray-200 px-2 py-1 rounded text-xs text-gray-800">
                  /image.jpg?format=webp
                </code>
                <span className="text-gray-600 ml-2">Convert format</span>
              </div>
              <div>
                <code className="bg-gray-200 px-2 py-1 rounded text-xs text-gray-800">
                  /image.jpg?size=medium&quality=90&format=webp
                </code>
                <span className="text-gray-600 ml-2">Combine parameters</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t">
            <p className="text-xs text-gray-500">
              Admin panel available at <code className="bg-gray-200 px-1 py-0.5 rounded text-gray-800">/manage</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
