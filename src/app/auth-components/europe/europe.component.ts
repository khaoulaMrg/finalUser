import { Component, OnDestroy, OnInit } from '@angular/core';
import { LatestService, PostDTO } from '../latest/latest-services/latest.service';
import { Observable, Subscription, catchError, interval, of, tap } from 'rxjs';
import { FirstService } from '../first/first-services/first.service';
import { ReportsService } from '../reports/reports-services/reports.service';
import { TrendService } from '../trend/trend-services/trend.service';

@Component({
  selector: 'app-europe',
  templateUrl: './europe.component.html',
  styleUrl: './europe.component.css'
})
export class EuropeComponent implements OnInit, OnDestroy {
  europePosts: PostDTO[] = [];
  currentFirstPost: PostDTO | undefined;
  private refreshSubscription!: Subscription;

  constructor(
    private latestService: LatestService, 
    private firstService: FirstService, 
    private trendService: TrendService, 
    private reportsService: ReportsService
  ) { }

  ngOnInit(): void {
    this.getMarocPosts();
    this.refreshSubscription = interval(60000).subscribe(() => {
      this.checkAndArchiveExpiredPosts();
    });

    this.latestService.receiveNewPost().subscribe(post => {
      this.addNewPost(post);
    });
  }

  ngOnDestroy(): void {
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
    }
  }

  checkAndArchiveExpiredPosts(): void {
    const now = new Date();

    this.europePosts.forEach(post => {
      if (new Date(post.expirationDate) <= now && !post.archived) {
        post.archived = true;
        this.archivePostByType(post);
      }
    });

    this.reorderPosts();
  }
  archivePostByType(post: PostDTO): void {
    const typeName = post.typeName; // Récupérer le type du post
  
    switch (typeName) {
      case 'first':
        this.firstService.archivePost(post.id).subscribe({
          next: () => console.log(`Post "${typeName}" archived:`, post),
          error: err => console.error(`Error archiving "${typeName}" post:`, err)
        });
        break;
      case 'trend':
        this.trendService.archivePost(post.id).subscribe({
          next: () => console.log(`Post "${typeName}" archived:`, post),
          error: err => console.error(`Error archiving "${typeName}" post:`, err)
        });
        break;
      case 'latest':
        this.latestService.archivePost(post.id).subscribe({
          next: () => console.log(`Post "${typeName}" archived:`, post),
          error: err => console.error(`Error archiving "${typeName}" post:`, err)
        });
        break;
      case 'reports':
        this.reportsService.archivePost(post.id).subscribe({
          next: () => console.log(`Post "${typeName}" archived:`, post),
          error: err => console.error(`Error archiving "${typeName}" post:`, err)
        });
        break;
      default:
        console.error('Unknown post type:', typeName);
    }
  }
  

  addNewPost(newPost: PostDTO): void {
    const now = new Date();

    if (newPost.typeName === 'first') {
      if (this.currentFirstPost && new Date(this.currentFirstPost.expirationDate) <= now) {
        this.moveCurrentFirstPostToArchive().subscribe(() => {
          this.currentFirstPost = newPost;
          this.europePosts.unshift(newPost);
        });
      } else if (!this.currentFirstPost) {
        this.currentFirstPost = newPost;
        this.europePosts.unshift(newPost);
      }
    } else if (['trend', 'latest', 'reports'].includes(newPost.typeName)) {
      if (new Date(newPost.expirationDate) > now) {
        this.europePosts.unshift(newPost);
        this.checkAndArchiveExpiredPosts();
      }
    }
  }

  moveCurrentFirstPostToArchive(): Observable<void> {
    if (this.currentFirstPost) {
      return this.firstService.archivePost(this.currentFirstPost.id).pipe(
        tap(() => this.currentFirstPost!.archived = true),
        catchError(err => {
          console.error('Error archiving current first post:', err);
          return of();
        })
      );
    }
    return of();
  }
  

  reorderPosts(): void {
    this.reorderReportsPosts();
    this.reorderLatestPosts();
    this.reorderTrendPosts();
  }

  reorderReportsPosts(): void {
    this.reorderPostsByType('reports', 4, this.reportsService, this.createPlaceholderReportsPost.bind(this));
  }

  reorderLatestPosts(): void {
    this.reorderPostsByType('latest', 2, this.latestService, this.createPlaceholderLatestPost.bind(this));
  }

  reorderTrendPosts(): void {
    this.reorderPostsByType('trend', 3, this.trendService, this.createPlaceholderTrendPost.bind(this));
  }

  reorderPostsByType(typeName: string, limit: number, service: any, createPlaceholder: () => PostDTO): void {
    const posts = this.europePosts.filter(post => post.typeName === typeName && !post.archived && post.approved);
  
    if (posts.length < limit) {
      while (posts.length < limit) {
        posts.push(createPlaceholder());
      }
    } else if (posts.length > limit) {
      const excessPosts = posts.slice(limit);
      excessPosts.forEach(post => {
        service.archivePost(post.id, typeName).subscribe({
          next: () => post.archived = true,
          error: (err: any) => console.error(`Error archiving excess "${typeName}" post:`, err)
        });
      });
    }
  
    this.europePosts = [...this.europePosts.filter(post => post.typeName !== typeName), ...posts];
  }
  

  createPlaceholderReportsPost(): PostDTO {
    return this.createPlaceholderPost('reports','europe');
  }

  createPlaceholderLatestPost(): PostDTO {
    return this.createPlaceholderPost('latest','europe');
  }

  createPlaceholderTrendPost(): PostDTO {
    return this.createPlaceholderPost('trend','europe');
  }

  createPlaceholderPost(typeName: string, categoryName:string): PostDTO {
    return {
      id: -1,
      typeName: typeName,
      postedBy: 'system',
      expirationDate: new Date(new Date().getTime() + 1000 * 60 * 60 * 24),
      archived: false,
      approved: false,
      byteImg: '',
      processedImg: 'placeholder.jpg',
      name: 'Placeholder Name',
      content: 'Placeholder Content',
      text: 'Placeholder Text',
      date: new Date(),
      posted: false,
      img: 'placeholder.jpg',
      categoryName: categoryName,
    };
  }

  getMarocPosts(): void {
    this.latestService.getApprovedPostsByCategory('europe')
      .subscribe(posts => {
        this.europePosts = posts.map(post => ({
          ...post,
          processedImg: 'data:image/jpeg;base64,' + post.byteImg
        }));

        const firstPosts = this.getFirstByType('first');
        this.currentFirstPost = firstPosts.length > 0 ? firstPosts[0] : undefined;
      });
  }

  getFirstByType(typeName: string): PostDTO[] {
    return this.europePosts.filter(post => post.typeName === typeName && !post.archived).slice(0, 1);
  }



  getFirstThreePostsByType(typeName: string): PostDTO[] {
    return this.europePosts.filter(post => post.typeName === typeName && !post.archived).slice(0, 3);
  }

  getFirstTwoPostsByType(typeName: string): PostDTO[] {
    return this.europePosts.filter(post => post.typeName === typeName && !post.archived).slice(0, 2);
  }

  getFirstFourPostsByType(typeName: string): PostDTO[] {
    return this.europePosts.filter(post => post.typeName === typeName && !post.archived).slice(0, 4);
  }
}
